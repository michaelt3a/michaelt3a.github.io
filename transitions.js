// Cross-page transition: fade/slide the content out on an internal link
// click, then navigate. The incoming page fades/slides in via CSS.
(() => {
  const DURATION = 260;

  document.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let new-tab etc. work
    const a = e.target.closest("a");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;

    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;

    // Internal page navigation — animate out, then go.
    e.preventDefault();
    document.body.classList.add("page-out");
    setTimeout(() => {
      window.location.href = href;
    }, DURATION);
  });

  // If restored from the back/forward cache, clear the leaving state.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) document.body.classList.remove("page-out");
  });
})();
