// Formatage des personnes renvoyées par les routes d'amis (jamais d'e-mail).
import { urlFichier } from './stockage.js';

export function versPersonne(p) {
  return {
    id: p.id,
    pseudo: p.pseudo || [p.prenom, p.nom].filter(Boolean).join(' ') || 'Utilisateur',
    avatar: urlFichier(p.avatar),
    decoration: urlFichier(p.decoration),
  };
}
