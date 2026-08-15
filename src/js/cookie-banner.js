// @ts-nocheck
// Bandeau de consentement cookies
const banner = document.getElementById('cookie-banner');
const consent = localStorage.getItem('cookie_consent');

if (!consent) {
  banner.style.display = 'block';
}

document.getElementById('cookie-accept').addEventListener('click', () => {
  localStorage.setItem('cookie_consent', 'accepted');
  banner.style.display = 'none';
});

document.getElementById('cookie-refuse').addEventListener('click', () => {
  localStorage.setItem('cookie_consent', 'refused');
  banner.style.display = 'none';
});
