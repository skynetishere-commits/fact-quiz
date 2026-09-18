import { z } from 'zod';

export const questionSchema = z.object({
  id: z.string().min(1),
  fact: z.string().trim().min(1, 'Введите текст факта'),
  options: z.array(z.string().trim().min(1, 'Заполните вариант')).min(4, 'Нужно минимум 4 варианта').max(10, 'Можно максимум 10 вариантов'),
  correctIndex: z.number().int().nonnegative(),
  durationSeconds: z.number().int().min(5, 'Минимум 5 секунд').max(300, 'Максимум 300 секунд'),
}).refine((q) => q.correctIndex < q.options.length, { message: 'Выберите правильный ответ', path: ['correctIndex'] });

export const questionsSchema = z.array(questionSchema).min(1, 'Добавьте хотя бы один вопрос');
export type QuizQuestion = z.infer<typeof questionSchema>;

export const defaultQuestions: QuizQuestion[] = [
  { id: '8d9e9b58-a00f-4ad7-b9df-87b2eef64091', fact: 'Большую часть детства провел(а) в редакции газеты', options: ['Дима Курамшин', 'Таня Петрова', 'Денис Салаватов', 'Соня Евстигнеева', 'Настя Некрасова', 'Коля Кулида', 'Ксюша Коновалова'], correctIndex: 2, durationSeconds: 30 },
  { id: '9a6df18b-c22c-4ec0-b421-a69f75cac123', fact: 'Родилась в закрытом городе, атомной и космической промышленности', options: ['Катя Лаврова', 'Аня Гантц', 'Аня Федонина', 'Даша Семенова', 'Маша Суходолец', 'Таня Сухинина'], correctIndex: 4, durationSeconds: 20 },
  { id: '1a0ab53e-6554-4399-adc1-4be617821575', fact: 'КМС по греко-римской борьбе', options: ['Игнат Калинин', 'Витя Турецков', 'Млада Николаева', 'Дима Радаев', 'Лиза Абанина', 'Юля Силантьева', 'Андрей Бекчев'], correctIndex: 0, durationSeconds: 30 },
  { id: 'f95dd156-93a7-4211-be7a-8c4bfc270321', fact: 'Работал монтажником интернета и на всю жизнь возненавидел голубей', options: ['Никита Круглышев', 'Андрей Бекчев', 'Дима Курамшин', 'Дима Радаев', 'Коля Кулида', 'Дима Синегубов'], correctIndex: 3, durationSeconds: 30 },
  { id: '458dc0cb-b7cf-4a0e-8591-d5905e3238df', fact: 'В 2012 году освещал(а) события вокруг судебного процесса над Pussy Riot, стоя перед Хамовническим судом в составе аккредитованной группы журналистов', options: ['Таня Петрова', 'Витя Турецков', 'Млада Николаева', 'Денис Салаватов', 'Дима Радаев', 'Даша Семенова'], correctIndex: 2, durationSeconds: 30 },
  { id: 'cfe2a65d-ee9e-4a2b-a446-32c69598f2d6', fact: 'В период жизни в Питере обзавелась(ся) целым садом из домашних цветов, было около 35 разных видов', options: ['Катя Лаврова', 'Дима Синегубов', 'Даша Семенова', 'Андрей Бекчев', 'Игнат Калинин', 'Лена Тараканова'], correctIndex: 1, durationSeconds: 30 },
  { id: 'c92527c6-7c8a-4a6f-bc3d-38ca43118780', fact: 'В детстве чуть не украли цыгане', options: ['Даша Семенова', 'Настя Щелина', 'Аня Гантц', 'Лиза Абанина', 'Соня Евстигнеева', 'Таня Сухинина'], correctIndex: 0, durationSeconds: 30 },
  { id: 'dcd593c3-fba3-473f-a17f-a8f1078b03cd', fact: 'В университете писал(а) диплом по детской литературе 1920-1930 годов и влиянии на нее Евгения Шварца, а также вел(а) тг-канал про детскую литературу', options: ['Дима Курамшин', 'Таня Сухинина', 'Никита Круглышев', 'Таня Петрова', 'Млада Николаева', 'Витя Турецков'], correctIndex: 1, durationSeconds: 30 },
  { id: '7999a154-0693-43be-93ac-3c5b6c46c99b', fact: 'Вышел(ла) из ГИБДД с только что полученным водительским удостоверением, сел(а) в свой припаркованный рядом VW Golf 3 и уехал(а) в закат', options: ['Дима Радаев', 'Таня Петрова', 'Витя Турецков', 'Коля Кулида', 'Ксюша Коновалова', 'Андрей Бекчев', 'Настя Щелина', 'Денис Салаватов', 'Аня Гантц'], correctIndex: 6, durationSeconds: 30 },
  { id: '0af94df4-6180-41d5-a66f-d75360f1d0fe', fact: 'В прошлом профессиональная танцовщица и тренер по восточным танцам', options: ['Настя Некрасова', 'Ксюша Коновалова', 'Аня Гантц', 'Настя Щелина', 'Соня Евстигнеева', 'Юля Силантьева'], correctIndex: 2, durationSeconds: 30 },
];

export function createQuestion(): QuizQuestion {
  return { id: crypto.randomUUID(), fact: '', options: ['', '', '', ''], correctIndex: 0, durationSeconds: 30 };
}

export function storageKey(token: string) { return `fact-quiz:questions:v2:${token}`; }

export function loadQuestions(storage: Pick<Storage, 'getItem'>, token: string): QuizQuestion[] {
  try {
    const raw = storage.getItem(storageKey(token));
    if (!raw) return defaultQuestions;
    const parsed = questionsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : defaultQuestions;
  } catch { return defaultQuestions; }
}

export function saveQuestions(storage: Pick<Storage, 'setItem'>, token: string, questions: QuizQuestion[]) {
  storage.setItem(storageKey(token), JSON.stringify(questions));
}

export function questionErrors(question: QuizQuestion): string[] {
  const result = questionSchema.safeParse(question);
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => issue.message))];
}
