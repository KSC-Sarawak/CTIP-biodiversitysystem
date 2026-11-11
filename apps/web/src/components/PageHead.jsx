// apps/web/src/components/PageHead.jsx
// The top of every staff page (Daun v2), built for a one-second read:
//   1. a small label and the page name,
//   2. ONE sentence that says what needs doing, with a coloured mark for how urgent it is,
//   3. a row of number tiles. A tile with `onClick` is a filter: it shows only those items
//      and stays pressed while it is in use.
// The page's main buttons sit on the right (on phones, under the sentence).
import Icon from "./Icon.jsx";

const TONE_ICON = { ok: "check", warn: "alert", bad: "alert", info: "info" };

export default function PageHead({ overline, title, lead, tone = "info", actions, stats = [], children }) {
  return (
    <header className="phead">
      <div className="phead-top">
        <div className="phead-text">
          {overline && <p className="overline">{overline}</p>}
          <h1>{title}</h1>
          {lead && (
            <p className={"phead-lead tone-" + tone}>
              <span className="phead-mark" aria-hidden="true"><Icon name={TONE_ICON[tone] || "info"} size={16} /></span>
              <span>{lead}</span>
            </p>
          )}
        </div>
        {actions && <div className="phead-acts">{actions}</div>}
      </div>
      {stats.length > 0 && (
        <div className="phead-stats" role={stats.some((s) => s.onClick) ? "group" : undefined} aria-label={stats.some((s) => s.onClick) ? "Show" : undefined}>
          {stats.map((s) => {
            const body = (
              <>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </>
            );
            const cls = "pstat" + (s.tone && s.value ? " tone-" + s.tone : "") + (s.on ? " on" : "");
            if (s.onClick) {
              return <button key={s.label} type="button" className={cls} onClick={s.onClick} aria-pressed={!!s.on}>{body}</button>;
            }
            if (s.href) return <a key={s.label} className={cls} href={s.href}>{body}</a>;
            return <div key={s.label} className={cls}>{body}</div>;
          })}
        </div>
      )}
      {children}
    </header>
  );
}
