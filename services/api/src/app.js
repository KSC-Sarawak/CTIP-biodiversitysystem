import express from 'express';
import cors from 'cors';
import { routes, PUBLIC, SENSOR } from './permissions.js';
import { requireAuth, allow, requireMfa, requirePasswordChanged } from './auth/middleware.js';
import { MFA_SETUP_ROUTES } from './mfa.js';
import { handlers as defaultHandlers } from './handlers.js';
import { requireHttps as httpsOnly } from './https.js';
import { requireSensorKey, receiveJpeg } from './sensors.js';

const notImplemented = (req, res) =>
  res.status(501).json({ code: 'NOT_IMPLEMENTED', message: `${req.method} ${req.path} is not built yet` });

// mfaRoles: roles whose token must say aal2 (VA-70). server.js passes every staff
// role (botanist, officer, admin); the older tests leave it empty, and test/mfa.test.js checks the rule.
export function createApp({ verify, handlers = defaultHandlers, corsOrigins = [], requireHttps = false, trustProxy = false, mfaRoles = [] }) {
  const app = express();
  app.disable('x-powered-by'); // F-12: don't tell attackers we run Express
  app.set('trust proxy', trustProxy);
  if (requireHttps) app.use(httpsOnly());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json());

  const v1 = express.Router();
  for (const [method, path, roles] of routes) {
    const handler = handlers[`${method} ${path}`] ?? notImplemented;
    if (roles === PUBLIC) {
      v1[method](path, handler);
    } else if (roles === SENSOR) {
      // IoT gateway: X-Sensor-Key instead of a person's token. The image
      // route takes raw JPEG bytes, read only after the key check.
      const body = path.endsWith('/images') ? [receiveJpeg] : [];
      v1[method](path, requireSensorKey, ...body, handler);
    } else {
      const key = `${method} ${path}`;
      const setup = MFA_SETUP_ROUTES.has(key);
      v1[method](path, requireAuth(verify), allow(...roles), requireMfa(mfaRoles, setup),
        requirePasswordChanged(setup || key === 'post /me/password'), handler);
    }
  }
  app.use('/v1', v1);
  app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'No such endpoint' }));
  app.use(errorHandler);
  return app;
}

// Last stop for errors. Answers in the same { code, message } shape as every
// other response, never Express's default HTML page or a stack trace.
// Express 5 also routes rejected promises from async handlers here.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'INVALID_JSON', message: 'Request body is not valid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' });
  }
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' });
}
