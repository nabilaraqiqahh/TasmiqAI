// ──────────────────────────────────────────────
//  Mock Students
// ──────────────────────────────────────────────
export const students = [
  {
    id: 's1',
    name: 'Ahmad Zulkifli',
    progress: 78,
    lastActivity: '2026-03-25',
    status: 'on_track',
    surah: 'Al-Baqarah',
    juz: 2,
    recitations: [
      {
        id: 'r1',
        date: '2026-03-25',
        surah: 'Al-Baqarah 1-10',
        tajwid: 82,
        fluency: 75,
        makhraj: 80,
        audioUrl: null,
        aiSummary: 'Student shows good overall command. Minor issues with Qalqalah pronunciation.',
        teacherFeedback: '',
        status: 'pending',
        teacherScore: null,
      },
      {
        id: 'r2',
        date: '2026-03-20',
        surah: 'Al-Fatihah',
        tajwid: 90,
        fluency: 88,
        makhraj: 92,
        audioUrl: null,
        aiSummary: 'Excellent recitation of Al-Fatihah with clear makhraj.',
        teacherFeedback: 'Great job! Keep up the consistency.',
        status: 'approved',
        teacherScore: 90,
      },
    ],
    tajwidMistakes: [
      { name: 'Idgham', count: 3 },
      { name: 'Ikhfa', count: 1 },
      { name: 'Qalqalah', count: 5 },
      { name: 'Mad', count: 2 },
      { name: 'Ghunnah', count: 1 },
    ],
  },
  {
    id: 's2',
    name: 'Nur Aisyah Binti Roslan',
    progress: 45,
    lastActivity: '2026-03-24',
    status: 'needs_monitoring',
    surah: 'Al-Imran',
    juz: 3,
    recitations: [
      {
        id: 'r3',
        date: '2026-03-24',
        surah: 'Al-Imran 1-5',
        tajwid: 58,
        fluency: 50,
        makhraj: 62,
        audioUrl: null,
        aiSummary: 'Student frequently struggles with Idgham and Ghunnah. Fluency needs significant improvement.',
        teacherFeedback: '',
        status: 'pending',
        teacherScore: null,
      },
    ],
    tajwidMistakes: [
      { name: 'Idgham', count: 8 },
      { name: 'Ikhfa', count: 6 },
      { name: 'Qalqalah', count: 2 },
      { name: 'Mad', count: 7 },
      { name: 'Ghunnah', count: 9 },
    ],
  },
  {
    id: 's3',
    name: 'Muhammad Hafiz Bin Ismail',
    progress: 22,
    lastActivity: '2026-03-22',
    status: 'high_correction',
    surah: 'Al-Baqarah',
    juz: 1,
    recitations: [
      {
        id: 'r4',
        date: '2026-03-22',
        surah: 'Al-Baqarah 1-5',
        tajwid: 35,
        fluency: 40,
        makhraj: 38,
        audioUrl: null,
        aiSummary: 'Multiple fundamental tajwid errors detected. Recommend focused review on basic rules especially Nun Sakinah and Tanwin.',
        teacherFeedback: '',
        status: 'redo',
        teacherScore: null,
      },
    ],
    tajwidMistakes: [
      { name: 'Idgham', count: 12 },
      { name: 'Ikhfa', count: 10 },
      { name: 'Qalqalah', count: 8 },
      { name: 'Mad', count: 11 },
      { name: 'Ghunnah', count: 14 },
    ],
  },
  {
    id: 's4',
    name: 'Fatimah Zahra Bt Abdullah',
    progress: 91,
    lastActivity: '2026-03-26',
    status: 'on_track',
    surah: 'An-Nisa',
    juz: 4,
    recitations: [
      {
        id: 'r5',
        date: '2026-03-26',
        surah: 'An-Nisa 1-8',
        tajwid: 94,
        fluency: 90,
        makhraj: 92,
        audioUrl: null,
        aiSummary: 'Outstanding performance. Near-perfect tajwid application across all rules.',
        teacherFeedback: '',
        status: 'pending',
        teacherScore: null,
      },
    ],
    tajwidMistakes: [
      { name: 'Idgham', count: 1 },
      { name: 'Ikhfa', count: 0 },
      { name: 'Qalqalah', count: 1 },
      { name: 'Mad', count: 2 },
      { name: 'Ghunnah', count: 0 },
    ],
  },
  {
    id: 's5',
    name: 'Amir Hamzah Bin Yazid',
    progress: 56,
    lastActivity: '2026-03-23',
    status: 'needs_monitoring',
    surah: 'Al-Maidah',
    juz: 6,
    recitations: [
      {
        id: 'r6',
        date: '2026-03-23',
        surah: 'Al-Maidah 1-5',
        tajwid: 65,
        fluency: 70,
        makhraj: 60,
        audioUrl: null,
        aiSummary: 'Student shows inconsistency in Makhraj pronunciation especially for Arabic emphatic letters.',
        teacherFeedback: '',
        status: 'pending',
        teacherScore: null,
      },
    ],
    tajwidMistakes: [
      { name: 'Idgham', count: 4 },
      { name: 'Ikhfa', count: 5 },
      { name: 'Qalqalah', count: 3 },
      { name: 'Mad', count: 6 },
      { name: 'Ghunnah', count: 4 },
    ],
  },
  {
    id: 's6',
    name: 'Siti Hajar Binti Mohd',
    progress: 38,
    lastActivity: '2026-03-21',
    status: 'high_correction',
    surah: 'Al-An\'am',
    juz: 7,
    recitations: [
      {
        id: 'r7',
        date: '2026-03-21',
        surah: 'Al-An\'am 1-6',
        tajwid: 42,
        fluency: 45,
        makhraj: 40,
        audioUrl: null,
        aiSummary: 'Consistent errors in ghunnah duration and idgham without ghunnah. Needs sustained practice.',
        teacherFeedback: '',
        status: 'pending',
        teacherScore: null,
      },
    ],
    tajwidMistakes: [
      { name: 'Idgham', count: 9 },
      { name: 'Ikhfa', count: 7 },
      { name: 'Qalqalah', count: 5 },
      { name: 'Mad', count: 8 },
      { name: 'Ghunnah', count: 11 },
    ],
  },
];

// ──────────────────────────────────────────────
//  Performance Trend (last 7 weeks)
// ──────────────────────────────────────────────
export const performanceTrend = [
  { week: 'W1', avgScore: 58 },
  { week: 'W2', avgScore: 62 },
  { week: 'W3', avgScore: 59 },
  { week: 'W4', avgScore: 68 },
  { week: 'W5', avgScore: 71 },
  { week: 'W6', avgScore: 74 },
  { week: 'W7', avgScore: 72 },
];

// ──────────────────────────────────────────────
//  Overall Tajwid Mistake Distribution
// ──────────────────────────────────────────────
export const overallMistakes = [
  { name: 'Idgham', count: 37 },
  { name: 'Ikhfa', count: 29 },
  { name: 'Qalqalah', count: 24 },
  { name: 'Mad', count: 36 },
  { name: 'Ghunnah', count: 39 },
];

// ──────────────────────────────────────────────
//  Completion Rate by Month
// ──────────────────────────────────────────────
export const completionRate = [
  { month: 'Oct', rate: 45 },
  { month: 'Nov', rate: 58 },
  { month: 'Dec', rate: 52 },
  { month: 'Jan', rate: 67 },
  { month: 'Feb', rate: 73 },
  { month: 'Mar', rate: 71 },
];

// ──────────────────────────────────────────────
//  Dummy teacher credentials
// ──────────────────────────────────────────────
export const teacherAccount = {
  email: 'ustaz@tasmiq.ai',
  password: 'password123',
  name: 'Ustaz Ridhwan',
  avatar: null,
};
