export const THEME_STORAGE_KEY = "pattyone:theme";

/** Runs before paint to apply the saved (or system) theme without a flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`;
