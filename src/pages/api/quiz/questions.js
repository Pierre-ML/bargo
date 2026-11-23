// GET /api/quiz/questions?theme=a,b&limite=10 -> { questions: [{ id, theme, question, choix[], reponses[] }] }
// Réservé aux utilisateurs connectés (la page de jeu l'est aussi).
export const prerender = false;

import { json, exigerSession } from '../../../lib/api.js';
import { listerQuestionsAleatoires } from '../../../lib/db.ts';

export async function GET({ url, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const themes = (url.searchParams.get('theme') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const limite = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limite') ?? '10', 10) || 10));

  const questions = listerQuestionsAleatoires(themes, limite).map((q) => ({
    id: q.id,
    theme: q.theme,
    question: q.question,
    choix: [q.choix_1, q.choix_2, q.choix_3, q.choix_4],
    reponses: [q.reponse_1, q.reponse_2, q.reponse_3, q.reponse_4],
  }));
  return json({ questions });
}
