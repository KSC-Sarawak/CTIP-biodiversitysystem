import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { supabaseService } from './supabase.js';
import { fail, dbError, parseBody, UUID } from './validate.js';

// The two routes the IoT gateway calls (CTIP-61, F-14/F-15 follow-up):
// readings and camera photos go through the API, never straight to Supabase.
// The gateway proves itself with the X-Sensor-Key header; the API then writes
// with the secret key, which only the API (Render) holds.

export const IMAGE_BUCKET = 'sensor-images';
export const MAX_IMAGE_BYTES = 2097152; // 2 MB, as in the contract

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();

// 503 when the server has no SENSOR_KEY or SUPABASE_SECRET_KEY (sensor routes
// switched off), 401 when the header is missing or wrong. Compared in constant time.
export function requireSensorKey(req, res, next) {
  const expected = process.env.SENSOR_KEY;
  if (!expected || !supabaseService()) {
    return fail(res, 503, 'SENSORS_OFF', 'Sensor upload is not set up on this server');
  }
  const given = req.get('X-Sensor-Key');
  if (!given || !crypto.timingSafeEqual(hash(given), hash(expected))) {
    return fail(res, 401, 'UNAUTHORIZED', 'Missing or wrong X-Sensor-Key');
  }
  next();
}

const isoTime = z.string().datetime({ offset: true });
const reading = z.object({
  ts: isoTime,
  temperature: z.number().min(-50).max(80).optional(),
  humidity: z.number().min(0).max(100).optional(),
  soil_moisture: z.number().min(0).max(100).optional(),
  distance_cm: z.number().min(0).max(10000).optional(),
  motion_detected: z.boolean().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).strict(); // an unknown field is refused, not silently stored
const telemetryBody = z.object({
  node_id: z.string().regex(UUID, 'must be a UUID'),
  readings: z.array(reading).min(1).max(100),
}).strict();

// The node, or null after answering 404 / 500.
async function findNode(db, id, res) {
  if (!UUID.test(id)) { fail(res, 404, 'NOT_FOUND', 'Sensor node not found'); return null; }
  const { data, error } = await db.from('sensor_nodes').select('id, status').eq('id', id).maybeSingle();
  if (error) { dbError(res, error); return null; }
  if (!data || data.status === 'retired') { fail(res, 404, 'NOT_FOUND', 'Sensor node not found'); return null; }
  return data;
}

async function ingestTelemetry(req, res) {
  const body = parseBody(telemetryBody, req, res);
  if (!body) return;
  const db = supabaseService();
  if (!(await findNode(db, body.node_id, res))) return;

  const rows = body.readings.map((r) => ({ ...r, node_id: body.node_id }));
  const { error } = await db.from('telemetry').insert(rows);
  if (error) return dbError(res, error);

  // Keep last_seen fresh for the offline alert (CTIP-76). Never in the future.
  const now = Date.now();
  const latest = Math.min(now, Math.max(...rows.map((r) => Date.parse(r.ts))));
  await db.from('sensor_nodes').update({ last_seen: new Date(latest).toISOString() }).eq('id', body.node_id);
  res.status(202).json({ stored: rows.length });
}

// Raw JPEG body only (not JSON or multipart), at most 2 MB; bigger -> 413 from errorHandler.
export const receiveJpeg = express.raw({ type: 'image/jpeg', limit: MAX_IMAGE_BYTES });

async function uploadNodeImage(req, res) {
  const bytes = req.body;
  // Must say image/jpeg AND start with the JPEG signature FF D8 FF.
  if (!req.is('image/jpeg') || !Buffer.isBuffer(bytes) || bytes.length < 3
      || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Send one JPEG image as the raw body (Content-Type: image/jpeg)');
  }
  const capturedAt = req.query.captured_at ?? req.get('X-Captured-At') ?? new Date().toISOString();
  if (!isoTime.safeParse(capturedAt).success) {
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'captured_at must be a date-time',
      details: { fields: [{ path: 'captured_at', message: 'Invalid datetime' }] } });
  }
  const db = supabaseService();
  const node = await findNode(db, req.params.id, res);
  if (!node) return;

  const id = crypto.randomUUID();
  const key = `${node.id}/${id}.jpg`; // contract: <node_id>/<image_id>.jpg
  const stored = await db.storage.from(IMAGE_BUCKET).upload(key, bytes, { contentType: 'image/jpeg', upsert: false });
  if (stored.error) return dbError(res, stored.error);

  const { data, error } = await db.from('sensor_images')
    .insert({ id, node_id: node.id, captured_at: capturedAt, s3_bucket: IMAGE_BUCKET, s3_key: key, size_bytes: bytes.length })
    .select('id, node_id, alert_id, captured_at, s3_bucket, s3_key, size_bytes, created_at')
    .single();
  if (error) {
    await db.storage.from(IMAGE_BUCKET).remove([key]); // no record, so do not keep the file
    return dbError(res, error);
  }
  res.status(201).json({ ...data, view_url: null });
}

export const sensorHandlers = {
  'post /telemetry': ingestTelemetry,
  'post /sensor-nodes/:id/images': uploadNodeImage,
};
