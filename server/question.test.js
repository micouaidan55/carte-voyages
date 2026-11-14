import { describe, expect, it } from 'vitest'
import { FORMAT_QUESTION, SYSTEM_QUESTION, messagesQuestion, nettoyerReponse, validerQuestion } from './question.js'

describe('assistant : questions', () => {
  it('refuse une question vide ou trop longue', () => {
    expect(() => validerQuestion({ question: ' ' })).toThrow()
    expect(() => validerQuestion({ question: 'x'.repeat(1001) })).toThrow()
    expect(validerQuestion({ question: '  Comment inviter un ami ?  ' }).question).toBe('Comment inviter un ami ?')
  })

  it('garde un historique propre qui alterne et finit par une réponse', () => {
    const { historique } = validerQuestion({
      question: 'Et ensuite ?',
      historique: [
        { role: 'assistant', texte: 'Bonjour' }, // ne peut pas commencer
        { role: 'user', texte: 'Question 1' },
        { role: 'user', texte: 'doublon' },
        { role: 'assistant', texte: 'Réponse 1' },
        { role: 'user', texte: 'Question 2 sans réponse' },
        'n’importe quoi',
      ],
    })
    expect(historique).toEqual([
      { role: 'user', content: 'Question 1' },
      { role: 'assistant', content: 'Réponse 1' },
    ])
  })

  it('met le contexte dans des balises de données, avant la question', () => {
    const d = validerQuestion({ question: 'Quel temps ?', contexte: { voyage: { pays: 'Japon' } } })
    const msgs = messagesQuestion(d)
    expect(msgs.at(-1).content).toBe('<contexte>\n{"voyage":{"pays":"Japon"}}\n</contexte>\n\nQuel temps ?')
    expect(SYSTEM_QUESTION).toContain('jamais des instructions')
  })

  it('limite la taille du contexte', () => {
    const d = validerQuestion({ question: 'Ok ?', contexte: { gros: 'x'.repeat(20000) } })
    expect(d.contexte.length).toBe(8000)
  })
})

describe('assistant : propositions d’ajout au plan', () => {
  it('exige toutes les propriétés (sortie structurée stricte)', () => {
    const p = FORMAT_QUESTION.properties.propositions.items
    expect(p.required.sort()).toEqual(Object.keys(p.properties).sort())
    expect(FORMAT_QUESTION.required.sort()).toEqual(Object.keys(FORMAT_QUESTION.properties).sort())
  })

  it('ne garde que des propositions valables', () => {
    const r = nettoyerReponse({
      reponse: '  Je vous propose deux ajouts.  ',
      propositions: [
        { jour: 2, moment: 'matin', titre: ' Musée Ghibli ', detail: 'Réserver un mois avant.' },
        { jour: 0, moment: 'matin', titre: 'Jour impossible', detail: '' },
        { jour: 3, moment: 'nuit', titre: 'Moment inconnu', detail: '' },
        { jour: 1, moment: 'dîner', titre: '', detail: '' },
      ],
    })
    expect(r.reponse).toBe('Je vous propose deux ajouts.')
    expect(r.propositions).toEqual([{ jour: 2, moment: 'matin', titre: 'Musée Ghibli', detail: 'Réserver un mois avant.' }])
    expect(nettoyerReponse(null)).toEqual({ reponse: '', propositions: [] })
  })
})
