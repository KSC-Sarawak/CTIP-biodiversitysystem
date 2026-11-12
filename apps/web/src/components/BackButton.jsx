// apps/web/src/components/BackButton.jsx
// "Back" for staff pages: returns to the page the person came from inside the site.
// When the page was opened directly (a link, a new tab, a refresh), there is nothing
// in this site to go back to, so it goes to `fallback` instead of leaving the site.
import Icon from "./Icon.jsx";
import { go } from "../useRoute.js";

let moved = false; // true once the person has moved between pages in this tab
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => { moved = true; });
}

export default function BackButton({ fallback = "/dashboard", label = "Back", className = "" }) {
  const back = () => {
    if (moved && window.history.length > 1) window.history.back();
    else go(fallback);
  };
  return (
    <button type="button" className={"backbtn " + className} onClick={back}>
      <Icon name="chevL" size={18} /> {label}
    </button>
  );
}
