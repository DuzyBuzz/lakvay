import { Component, computed, inject, output, signal } from '@angular/core';
import { Auth, ConsumerQuestionId } from '../../../core/auth';

type Question = {
  id: ConsumerQuestionId;
  prompt: string;
  options: string[];
};

type Archetype = 'Amaran' | 'Lakandiwa' | 'Dayawan' | 'Haranista' | 'Hirayan' | 'Siga';

const ARCHETYPE_ORDER: Archetype[] = [
  'Amaran',
  'Lakandiwa',
  'Dayawan',
  'Haranista',
  'Hirayan',
  'Siga',
];

const ARCHETYPE_TITLES: Record<Archetype, string> = {
  Amaran: 'The Local Soul',
  Lakandiwa: 'The Cultural Connoisseur',
  Dayawan: 'The Social Feaster',
  Haranista: 'The Ambience Seeker',
  Hirayan: 'The Curious Explorer',
  Siga: 'The Flavor Chaser',
};

const ANSWER_ARCHETYPES: Record<ConsumerQuestionId, Record<string, Archetype>> = {
  food: {
    'Carinderias & Local Eateries': 'Lakandiwa',
    'Food stalls': 'Siga',
    'Bakeries & Pastry Shops': 'Amaran',
    'Casual Dining Restaurants': 'Dayawan',
    'Buffet Restaurants': 'Lakandiwa',
    'Bars & Pubs': 'Haranista',
    'Fine Dining Restaurants': 'Dayawan',
    'Themed & Concept Restaurants': 'Hirayan',
    'Cafés & Coffee Shops': 'Amaran',
  },
  experience: {
    'Cozy & Relaxed': 'Amaran',
    'Social & Lively': 'Haranista',
    'Aesthetic & Trendy': 'Hirayan',
    'Local & Community-Oriented': 'Lakandiwa',
    'Quick & Convenient': 'Siga',
    'Premium & Upscale': 'Dayawan',
    'Nature & Outdoorsy': 'Amaran',
    'Adventurous & Experimental': 'Lakandiwa',
    'Cultural & Heritage-Inspired': 'Dayawan',
    'Interactive & Immersive': 'Hirayan',
  },
  flavor: {
    Sweet: 'Hirayan',
    Salty: 'Haranista',
    Sour: 'Lakandiwa',
    Bitter: 'Amaran',
    Spicy: 'Siga',
    'Savory & Umami': 'Dayawan',
  },
  discovery: {
    'Social Media': 'Hirayan',
    'Friends, Family & Community': 'Haranista',
    'Exploring & Spontaneous Discoveries': 'Lakandiwa',
    'Food Events & Markets': 'Siga',
    'Web browser': 'Dayawan',
  },
  priority: {
    'Price & Value': 'Siga',
    'Menu Variety & Selection': 'Lakandiwa',
    'Food Quality & Taste': 'Dayawan',
    'Ambience & Comfort': 'Amaran',
    'Location & Convenience': 'Haranista',
    'Quality Service': 'Dayawan',
    'Reputation & Reviews': 'Hirayan',
  },
};

@Component({
  selector: 'app-consumer-onboarding',
  templateUrl: './consumer-onboarding.html',
})
export class ConsumerOnboarding {
  private readonly auth = inject(Auth);

  readonly closed = output<void>();
  readonly completed = output<void>();
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly currentIndex = signal(0);
  protected readonly selectedAnswers = signal<string[]>([]);
  protected readonly showResult = signal(false);
  protected readonly questions: Question[] = [
    {
      id: 'food',
      prompt: 'What kind of food do you enjoy exploring?',
      options: [
        'Carinderias & Local Eateries',
        'Food stalls',
        'Bakeries & Pastry Shops',
        'Casual Dining Restaurants',
        'Buffet Restaurants',
        'Bars & Pubs',
        'Fine Dining Restaurants',
        'Themed & Concept Restaurants',
        'Cafés & Coffee Shops',
      ],
    },
    {
      id: 'experience',
      prompt: 'What kind of experience fits your personality?',
      options: [
        'Cozy & Relaxed',
        'Social & Lively',
        'Aesthetic & Trendy',
        'Local & Community-Oriented',
        'Quick & Convenient',
        'Premium & Upscale',
        'Nature & Outdoorsy',
        'Adventurous & Experimental',
        'Cultural & Heritage-Inspired',
        'Interactive & Immersive',
      ],
    },
    {
      id: 'flavor',
      prompt: 'Which flavor profile do you enjoy the most?',
      options: ['Sweet', 'Salty', 'Sour', 'Bitter', 'Spicy', 'Savory & Umami'],
    },
    {
      id: 'discovery',
      prompt: 'How do you usually discover local places?',
      options: [
        'Social Media',
        'Friends, Family & Community',
        'Exploring & Spontaneous Discoveries',
        'Food Events & Markets',
        'Web browser',
      ],
    },
    {
      id: 'priority',
      prompt: 'What matters most when choosing a place?',
      options: [
        'Price & Value',
        'Menu Variety & Selection',
        'Food Quality & Taste',
        'Ambience & Comfort',
        'Location & Convenience',
        'Quality Service',
        'Reputation & Reviews',
      ],
    },
  ];
  protected readonly question = computed(() => this.questions[this.currentIndex()]);
  protected readonly progress = computed(
    () => Math.round(((this.currentIndex() + 1) / this.questions.length) * 100),
  );
  protected readonly personality = computed(() => {
    const answers = this.auth.consumerAnswers();
    const scores = new Map<Archetype, number>(
      ARCHETYPE_ORDER.map((archetype) => [archetype, 0]),
    );
    for (const [questionId, selectedAnswers] of Object.entries(answers)) {
      for (const answer of selectedAnswers ?? []) {
        const archetype = ANSWER_ARCHETYPES[questionId as ConsumerQuestionId]?.[answer];
        if (archetype) scores.set(archetype, (scores.get(archetype) ?? 0) + 1);
      }
    }

    const highestScore = Math.max(...scores.values());
    const tiedArchetypes = ARCHETYPE_ORDER.filter(
      (archetype) => scores.get(archetype) === highestScore,
    );
    const winner =
      this.tieBreak(tiedArchetypes, answers.flavor, 'flavor') ??
      this.tieBreak(tiedArchetypes, answers.food, 'food') ??
      this.tieBreak(tiedArchetypes, answers.experience, 'experience') ??
      tiedArchetypes[0];
    return `${winner.toUpperCase()} — ${ARCHETYPE_TITLES[winner]}`;
  });

  constructor() {
    this.moveToNextUnanswered(0);
  }

  protected choose(answer: string): void {
    this.error.set('');
    this.selectedAnswers.update((selected) =>
      selected.includes(answer) ? selected.filter((item) => item !== answer) : [...selected, answer],
    );
  }

  protected async next(): Promise<void> {
    const answers = this.selectedAnswers();
    if (answers.length === 0) {
      this.error.set('Choose an answer or skip this question.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.saveConsumerAnswer(this.question().id, answers);
      this.advance();
    } catch (reason) {
      this.error.set(this.auth.errorMessage(reason));
    } finally {
      this.busy.set(false);
    }
  }

  protected skip(): void {
    this.error.set('');
    this.advance();
  }

  protected finish(): void {
    this.completed.emit();
  }

  protected close(): void {
    this.closed.emit();
  }

  private advance(): void {
    const nextIndex = this.findNextUnanswered(this.currentIndex() + 1);
    if (nextIndex === -1) {
      if (this.auth.needsConsumerOnboarding()) {
        this.close();
      } else {
        this.showResult.set(true);
      }
      return;
    }
    this.moveToNextUnanswered(nextIndex);
  }

  private moveToNextUnanswered(startIndex: number): void {
    const nextIndex = this.findNextUnanswered(startIndex);
    if (nextIndex === -1) {
      this.showResult.set(true);
      return;
    }
    this.currentIndex.set(nextIndex);
    this.selectedAnswers.set(this.auth.consumerAnswers()[this.questions[nextIndex].id] ?? []);
  }

  private findNextUnanswered(startIndex: number): number {
    const answers = this.auth.consumerAnswers();
    for (let index = startIndex; index < this.questions.length; index += 1) {
      if (!answers[this.questions[index].id]) return index;
    }
    return -1;
  }

  private tieBreak(
    tiedArchetypes: Archetype[],
    answers: string[] | undefined,
    questionId: ConsumerQuestionId,
  ): Archetype | undefined {
    return answers?.find((answer) => {
      const archetype = ANSWER_ARCHETYPES[questionId][answer];
      return archetype && tiedArchetypes.includes(archetype);
    })
      ? ANSWER_ARCHETYPES[questionId][
          answers.find((answer) => tiedArchetypes.includes(ANSWER_ARCHETYPES[questionId][answer]))!
        ]
      : undefined;
  }
}
