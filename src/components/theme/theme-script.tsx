/**
 * Applies the saved theme before first paint.
 *
 * This has to run synchronously in <head>, ahead of React, or the page renders
 * in the default theme for a frame and then snaps — the classic dark-mode
 * flash. It reads the same key the ThemeToggle writes.
 */
const SCRIPT = `(function(){try{
var k='nexora-theme';
var s=localStorage.getItem(k);
var t=s||'light';
if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
document.documentElement.classList.toggle('dark',t==='dark');
document.documentElement.style.colorScheme=t;
}catch(e){}})();`;

export function ThemeScript({ nonce }: { nonce?: string }) {
  return (
    <script
      nonce={nonce}
      // Static, self-contained string with no interpolation of user input.
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}

export const THEME_STORAGE_KEY = "nexora-theme";
