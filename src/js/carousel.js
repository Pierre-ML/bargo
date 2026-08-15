// @ts-nocheck
// Carousel bars — swipe par translateX sur le track
const track = document.getElementById('bar-track');
if (track) {
  const total = track.children.length;
  let current = 0;

  function showSlide(n) {
    current = n;
    track.style.transform = `translateX(-${n * (100 / total)}%)`;
  }

  document.getElementById('bar-prev').addEventListener('click', () => {
    showSlide((current - 1 + total) % total);
  });

  document.getElementById('bar-next').addEventListener('click', () => {
    showSlide((current + 1) % total);
  });
}
