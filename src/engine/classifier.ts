import type { Emotion } from '../types'

export type Mood = 'happy' | 'sad' | 'angry' | 'surprised' | 'bored' | 'sleepy' | 'curious' | 'loving' | 'waking' | 'neutral'

interface Rule { mood: Mood; words: string[]; weight?: number }
const RULES: Rule[] = [
  { mood: 'happy', words: ['happy', 'great', 'wonderful', 'good', 'glad', 'love it', 'fun', 'laugh', 'joke', 'funny', 'smile', 'delighted', 'enjoy', 'lovely', 'nice', 'beautiful', 'hello', 'hi ', 'hey', 'welcome', 'party', 'birthday', 'excited', 'thank'] },
  { mood: 'loving', words: ['love you', 'i love', 'hug', 'cuddle', 'sweet', 'dear', 'darling', 'grandchild', 'grandson', 'granddaughter', 'family', 'miss you', 'adore', 'heart', 'care about'], weight: 1.4 },
  { mood: 'sad', words: ['sad', 'lonely', 'alone', 'cry', 'miss', 'hurt', 'pain', 'sorry', 'unhappy', 'depressed', 'tired of', 'grief', 'lost', 'died', 'passed away', 'funeral', 'bad day', 'worried', 'anxious', 'scared'] },
  { mood: 'angry', words: ['angry', 'mad', 'furious', 'hate', 'annoyed', 'annoying', 'stupid', 'terrible', 'awful', 'rude', 'shut up', 'unfair', 'frustrat', 'irritat', 'broken again'] },
  { mood: 'surprised', words: ['wow', 'surprise', 'amazing', 'unbelievable', 'really?', 'no way', 'what?!', 'whoa', 'incredible', 'shocked', 'suddenly', 'omg', 'oh my'], weight: 1.2 },
  { mood: 'bored', words: ['bored', 'boring', 'nothing to do', 'whatever', 'meh', 'dull', 'same old', 'yawn', 'tedious'] },
  { mood: 'sleepy', words: ['sleep', 'sleepy', 'tired', 'goodnight', 'good night', 'bedtime', 'nap', 'rest', 'exhausted', 'dream', 'lights out'], weight: 1.1 },
  { mood: 'waking', words: ['wake up', 'good morning', 'morning', 'rise and shine', 'wake', 'awake'], weight: 1.5 },
  { mood: 'curious', words: ['what', 'why', 'how', 'who', 'where', 'when', 'tell me', 'explain', 'curious', 'wonder', 'weather', 'news', 'medicine', 'pills', 'remind', 'appointment', 'recipe', '?'], weight: 0.8 },
]

export interface Classification {
  mood: Mood
  confidence: number
  hits: string[]
  scores: Record<string, number>
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const reCache = new Map<string, RegExp>()
function wordRe(w: string) {
  let r = reCache.get(w)
  if (!r) {
    const core = esc(w.trim())
    const exact = w.endsWith(' ') || w.trim().length <= 3
    r = new RegExp('(^|[^a-z])' + core + (exact ? '([^a-z]|$)' : ''), 'i')
    reCache.set(w, r)
  }
  return r
}

export function classify(text: string): Classification {
  const t = ' ' + text.toLowerCase().replace(/\s+/g, ' ').trim() + ' '
  const scores: Record<string, number> = {}
  const hits: string[] = []
  for (const r of RULES) {
    let s = 0
    for (const w of r.words) {
      if (wordRe(w).test(t)) {
        s += r.weight ?? 1
        hits.push(w.trim())
      }
    }
    if (s) scores[r.mood] = s
  }
  // negations flip happy -> sad
  if (/\b(not|n't|never)\b\s+(\w+\s+)?(happy|good|great|fine|well)/.test(t)) {
    scores.sad = (scores.sad ?? 0) + 2
    scores.happy = Math.max(0, (scores.happy ?? 0) - 2)
  }
  const entries = Object.entries(scores).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (!entries.length) return { mood: 'neutral', confidence: 0.4, hits: [], scores }
  const total = entries.reduce((n, [, v]) => n + v, 0)
  return { mood: entries[0][0] as Mood, confidence: Math.min(0.99, 0.5 + 0.5 * (entries[0][1] / total) * Math.min(1, entries[0][1] / 2)), hits: [...new Set(hits)], scores }
}

/** Animation-name playlists per mood. */
export const MOOD_SEQUENCE: Record<Mood, string[]> = {
  happy: ['happy_squint', 'curious_glance', 'happy_squint'],
  loving: ['loving_heart', 'happy_squint'],
  sad: ['sad_droop'],
  angry: ['angry_glare'],
  surprised: ['surprised_widening', 'curious_glance'],
  bored: ['bored_blink', 'look_around'],
  sleepy: ['bored_blink', 'sleeping_eyes'],
  curious: ['curious_glance', 'look_around'],
  waking: ['waking_up', 'look_around'],
  neutral: ['look_around'],
}

export const MOOD_EMOTION: Record<Mood, Emotion> = {
  happy: 'Happy', loving: 'Happy', sad: 'Sad', angry: 'Angry', surprised: 'Surprised',
  bored: 'Bored', sleepy: 'Sleeping', curious: 'Curious', waking: 'Waking', neutral: 'Neutral',
}

const REPLIES: Record<Mood, string[]> = {
  happy: ["That's lovely to hear! You've made my day brighter.", "Wonderful! Shall we celebrate with a little chat?"],
  loving: ["That's so sweet. I'm always here for you, dear friend.", "Family is precious. Would you like me to call someone?"],
  sad: ["I'm sorry you feel that way. I'm right here with you.", "That sounds hard. Shall I put on some gentle music?"],
  angry: ["I understand, that sounds really frustrating. Let's take a slow breath together.", "I hear you. Would you like to talk it through?"],
  surprised: ["Goodness, that's quite something! Tell me more.", "Oh my! I did not expect that."],
  bored: ["Let's find something fun. How about a story or a quiz?", "Hmm, a quiet day. Shall I read you the news?"],
  sleepy: ["Rest well. I'll keep an eye on things while you sleep.", "Sweet dreams. I'll dim the lights."],
  curious: ["Good question! Let me think about that for a moment.", "I'm curious about that too. Let's find out."],
  waking: ["Good morning! I hope you slept well.", "Rise and shine! Ready for a lovely day?"],
  neutral: ["I'm listening. Tell me more whenever you like.", "I'm here whenever you need me."],
}
export const pickReply = (m: Mood) => {
  const r = REPLIES[m]
  return r[Math.floor(Math.random() * r.length)]
}
