(() => {
  const storageKey = 'taplink-theme';
  let currentTheme = 'light';

  try {
    const savedTheme = localStorage.getItem(storageKey);
    if (savedTheme === 'dark' || savedTheme === 'light') currentTheme = savedTheme;
  } catch (error) {
    currentTheme = 'light';
  }

  const applyTheme = (theme) => {
    currentTheme = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      const label = `Switch to ${nextTheme} mode`;
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    });
  };

  applyTheme(currentTheme);
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        try {
          localStorage.setItem(storageKey, nextTheme);
        } catch (error) {
          button.title = `${button.title} (this choice cannot be saved in this browser)`;
        }
      });
    });
  });
})();