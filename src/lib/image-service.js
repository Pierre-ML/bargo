// Service d'images « sans transformation » pour Cloudflare Workers.
// Les images importées sont déjà des fichiers (.avif, .svg) publiés dans /_astro/ :
// on renvoie directement leur URL, sans passer par l'endpoint /_image (qui, sur
// Workers, refaisait un fetch vers le domaine public et renvoyait une erreur 526).
export default {
  getURL(options) {
    return typeof options.src === 'string' ? options.src : options.src.src;
  },
  getHTMLAttributes(options) {
    const { src, format, quality, ...attrs } = options;
    return attrs;
  },
};
