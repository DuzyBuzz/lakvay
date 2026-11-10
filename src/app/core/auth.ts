import { computed, inject, Service, signal } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import {
  ConfirmationResult,
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FirebaseClient } from './firebase-client';

export type AccountType = 'consumer' | 'merchant';
export type ConsumerQuestionId =
  | 'food'
  | 'experience'
  | 'flavor'
  | 'discovery'
  | 'priority';
export type ConsumerAnswers = Partial<Record<ConsumerQuestionId, string[]>>;

@Service()
export class Auth {
  private readonly firebase = inject(FirebaseClient);
  private readonly currentUser = signal<User | null>(null);
  private readonly confirmationResult = signal<ConfirmationResult | null>(null);
  private readonly currentAccountType = signal<AccountType | null>(null);
  private readonly currentConsumerAnswers = signal<ConsumerAnswers>({});
  private readonly consumerOnboardingCompleted = signal(false);
  private recaptchaVerifier: RecaptchaVerifier | null = null;
  private pendingPhoneAccountType: AccountType = 'consumer';

  readonly user = this.currentUser.asReadonly();
  readonly accountType = this.currentAccountType.asReadonly();
  readonly isMerchant = computed(() => this.currentAccountType() === 'merchant');
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly consumerAnswers = this.currentConsumerAnswers.asReadonly();
  readonly consumerPersonality = computed(() => {
    const scores: Record<string, number> = {
      Amaran: 0, Lakandiwa: 0, Dayawan: 0, Haranista: 0, Hirayan: 0, Siga: 0,
    };
    const mapping: Record<string, string> = {
      'Bakeries & Pastry Shops': 'Amaran', 'Cafés & Coffee Shops': 'Amaran',
      'Cozy & Relaxed': 'Amaran', 'Nature & Outdoorsy': 'Amaran', Bitter: 'Amaran',
      'Ambience & Comfort': 'Amaran',
      'Carinderias & Local Eateries': 'Lakandiwa', 'Buffet Restaurants': 'Lakandiwa',
      'Local & Community-Oriented': 'Lakandiwa', 'Adventurous & Experimental': 'Lakandiwa',
      Sour: 'Lakandiwa', 'Exploring & Spontaneous Discoveries': 'Lakandiwa',
      'Menu Variety & Selection': 'Lakandiwa',
      'Casual Dining Restaurants': 'Dayawan', 'Fine Dining Restaurants': 'Dayawan',
      'Premium & Upscale': 'Dayawan', 'Cultural & Heritage-Inspired': 'Dayawan',
      'Savory & Umami': 'Dayawan', 'Web browser': 'Dayawan',
      'Food Quality & Taste': 'Dayawan', 'Quality Service': 'Dayawan',
      'Bars & Pubs': 'Haranista', 'Social & Lively': 'Haranista', Salty: 'Haranista',
      'Friends, Family & Community': 'Haranista', 'Location & Convenience': 'Haranista',
      'Themed & Concept Restaurants': 'Hirayan', 'Aesthetic & Trendy': 'Hirayan',
      'Interactive & Immersive': 'Hirayan', Sweet: 'Hirayan', 'Social Media': 'Hirayan',
      'Reputation & Reviews': 'Hirayan',
      'Food stalls': 'Siga', 'Quick & Convenient': 'Siga', Spicy: 'Siga',
      'Food Events & Markets': 'Siga', 'Price & Value': 'Siga',
    };
    for (const answers of Object.values(this.currentConsumerAnswers())) {
      for (const answer of answers ?? []) {
        const archetype = mapping[answer];
        if (archetype) scores[archetype] += 1;
      }
    }
    const winner = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];
    const titles: Record<string, string> = {
      Amaran: 'The Local Soul', Lakandiwa: 'The Cultural Connoisseur', Dayawan: 'The Social Feaster',
      Haranista: 'The Ambience Seeker', Hirayan: 'The Curious Explorer', Siga: 'The Flavor Chaser',
    };
    return `${winner.toUpperCase()} — ${titles[winner]}`;
  });
  readonly needsConsumerOnboarding = computed(
    () => this.currentAccountType() === 'consumer' && !this.consumerOnboardingCompleted(),
  );

  constructor() {
    if (this.firebase.auth) {
      onAuthStateChanged(this.firebase.auth, (user) => {
        this.currentUser.set(user);
        if (user) {
          void this.loadAccountType(user).catch((reason: unknown) => {
            console.error('Unable to load the signed-in account type.', reason);
            this.currentAccountType.set(null);
          });
        } else {
          this.currentAccountType.set(null);
          this.currentConsumerAnswers.set({});
          this.consumerOnboardingCompleted.set(false);
        }
      });
    }
  }

  async signInWithGoogle(accountType: AccountType = 'consumer'): Promise<void> {
    const result = await signInWithPopup(this.requireAuth(), new GoogleAuthProvider());
    await this.saveUserProfile(result.user, accountType);
  }

  async signInWithFacebook(accountType: AccountType = 'consumer'): Promise<void> {
    const result = await signInWithPopup(this.requireAuth(), new FacebookAuthProvider());
    await this.saveUserProfile(result.user, accountType);
  }

  async signInWithEmail(
    email: string,
    password: string,
    accountType: AccountType = 'consumer',
  ): Promise<void> {
    const result = await signInWithEmailAndPassword(this.requireAuth(), email.trim(), password);
    await this.saveUserProfile(result.user, accountType);
  }

  async createEmailAccount(
    displayName: string,
    email: string,
    password: string,
    accountType: AccountType = 'consumer',
  ): Promise<void> {
    const result = await createUserWithEmailAndPassword(this.requireAuth(), email.trim(), password);
    await updateProfile(result.user, { displayName: displayName.trim() });
    await this.saveUserProfile(result.user, accountType);
  }

  async sendPhoneCode(
    phoneNumber: string,
    containerId: string,
    accountType: AccountType = 'consumer',
  ): Promise<void> {
    const auth = this.requireAuth();
    this.clearRecaptcha();
    this.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
    });
    this.confirmationResult.set(
      await signInWithPhoneNumber(auth, phoneNumber.trim(), this.recaptchaVerifier),
    );
    this.pendingPhoneAccountType = accountType;
  }

  async confirmPhoneCode(code: string): Promise<void> {
    const result = this.confirmationResult();
    if (!result) {
      throw new Error('Request a text message verification code first.');
    }
    const credential = await result.confirm(code.trim());
    if (!credential.user.displayName) {
      await updateProfile(credential.user, { displayName: 'Lakvay Explorer' });
    }
    await this.saveUserProfile(credential.user, this.pendingPhoneAccountType);
    this.confirmationResult.set(null);
    this.pendingPhoneAccountType = 'consumer';
    this.clearRecaptcha();
  }

  async signOut(): Promise<void> {
    if (this.firebase.auth) {
      await signOut(this.firebase.auth);
    }
  }

  async updateDisplayName(displayName: string): Promise<void> {
    const user = this.currentUser();
    const firestore = this.firebase.firestore;
    const cleanName = displayName.trim();
    if (!user || !firestore) {
      throw new Error('Sign in before updating your profile.');
    }

    if (cleanName.length < 2 || cleanName.length > 80) {
      throw new Error('Your display name must be between 2 and 80 characters.');
    }
    await updateProfile(user, { displayName: cleanName });
    await setDoc(
      doc(firestore, 'users', user.uid),
      { displayName: cleanName, updatedAt: serverTimestamp() },
      { merge: true },
    );
    this.currentUser.set(user);
  }

  async becomeMerchant(): Promise<void> {
    const user = this.currentUser();
    const firestore = this.firebase.firestore;
    if (!user || !firestore) {
      throw new Error('Sign in before creating a merchant profile.');
    }
    if (this.currentAccountType() === 'merchant') return;

    await setDoc(
      doc(firestore, 'users', user.uid),
      { accountType: 'merchant', updatedAt: serverTimestamp() },
      { merge: true },
    );
    this.currentAccountType.set('merchant');
  }

  async saveConsumerAnswer(questionId: ConsumerQuestionId, answersForQuestion: string[]): Promise<void> {
    const user = this.currentUser();
    const firestore = this.firebase.firestore;
    const cleanAnswers = [...new Set(answersForQuestion.map((answer) => answer.trim()))].filter(Boolean);
    if (!user || !firestore) {
      throw new Error('Sign in before saving your preferences.');
    }
    if (cleanAnswers.length === 0) {
      throw new Error('Choose at least one answer before continuing.');
    }

    const answers = { ...this.currentConsumerAnswers(), [questionId]: cleanAnswers };
    const completed = this.hasAllConsumerAnswers(answers);
    await setDoc(
      doc(firestore, 'users', user.uid),
      {
        consumerAnswers: answers,
        consumerOnboardingCompleted: completed,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    this.currentConsumerAnswers.set(answers);
    this.consumerOnboardingCompleted.set(completed);
  }

  clearPhoneVerification(): void {
    this.confirmationResult.set(null);
    this.clearRecaptcha();
  }

  errorMessage(error: unknown): string {
    if (error instanceof FirebaseError) {
      const messages: Record<string, string> = {
        'auth/account-exists-with-different-credential':
          'An account already exists with a different sign-in method.',
        'auth/email-already-in-use': 'This email already has an account. Try signing in.',
        'auth/invalid-credential': 'The email or password is incorrect.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/invalid-phone-number': 'Enter a valid phone number with its country code.',
        'auth/missing-phone-number': 'Enter a phone number, including its country code.',
        'auth/operation-not-allowed':
          'This sign-in method is not enabled in your Firebase Authentication settings.',
        'auth/popup-blocked': 'Allow pop-ups for this site, then try Google sign-in again.',
        'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
        'auth/too-many-requests': 'Too many attempts. Wait a while, then try again.',
        'auth/unauthorized-domain':
          'Add this website domain to the authorized domains in Firebase Authentication.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/user-not-found': 'No account was found for this email.',
        'auth/weak-password': 'Choose a password with at least 6 characters.',
        'auth/wrong-password': 'The password is incorrect.',
      };
      return messages[error.code] ?? `Sign-in failed: ${error.message}`;
    }

    return error instanceof Error ? error.message : 'Sign-in failed. Please try again.';
  }

  private requireAuth() {
    if (!this.firebase.auth) {
      throw new Error('Firebase is not configured. Add your Firebase web app settings first.');
    }
    return this.firebase.auth;
  }

  private async saveUserProfile(user: User, requestedAccountType: AccountType): Promise<void> {
    const firestore = this.firebase.firestore;
    if (!firestore) {
      throw new Error('Firebase Firestore is not configured.');
    }

    const profileRef = doc(firestore, 'users', user.uid);
    const existingProfile = await getDoc(profileRef);
    const storedAccountType = existingProfile.data()?.['accountType'];
    const accountType: AccountType =
      storedAccountType === 'merchant' || storedAccountType === 'consumer'
        ? storedAccountType
        : requestedAccountType;
    const displayName =
      user.displayName?.trim() || user.email || user.phoneNumber || 'Lakvay Explorer';
    const storedAnswers = this.readConsumerAnswers(existingProfile.data()?.['consumerAnswers']);
    const completed = existingProfile.data()?.['consumerOnboardingCompleted'] === true;
    const profile = {
      uid: user.uid,
      displayName: displayName.slice(0, 80),
      email: user.email,
      photoURL: user.photoURL,
      updatedAt: serverTimestamp(),
    };

    await setDoc(
      profileRef,
      existingProfile.exists()
        ? profile
        : {
            ...profile,
            accountType: requestedAccountType,
            status: 'active',
            createdAt: serverTimestamp(),
          },
      { merge: true },
    );
    this.currentAccountType.set(accountType);
    this.currentConsumerAnswers.set(storedAnswers);
    this.consumerOnboardingCompleted.set(completed);
  }

  private async loadAccountType(user: User): Promise<void> {
    const firestore = this.firebase.firestore;
    if (!firestore) {
      this.currentAccountType.set(null);
      return;
    }

    const profile = await getDoc(doc(firestore, 'users', user.uid));
    const accountType = profile.data()?.['accountType'];
    this.currentAccountType.set(
      accountType === 'merchant' || accountType === 'consumer' ? accountType : null,
    );
    this.currentConsumerAnswers.set(this.readConsumerAnswers(profile.data()?.['consumerAnswers']));
    this.consumerOnboardingCompleted.set(
      profile.data()?.['consumerOnboardingCompleted'] === true,
    );
  }

  private hasAllConsumerAnswers(answers: ConsumerAnswers): boolean {
    return ['food', 'experience', 'flavor', 'discovery', 'priority'].every(
      (questionId) => Boolean(answers[questionId as ConsumerQuestionId]),
    );
  }

  private readConsumerAnswers(value: unknown): ConsumerAnswers {
    if (!value || typeof value !== 'object') return {};
    const answers: ConsumerAnswers = {};
    for (const questionId of ['food', 'experience', 'flavor', 'discovery', 'priority'] as const) {
      const answer = (value as Record<string, unknown>)[questionId];
      if (Array.isArray(answer)) {
        const cleanAnswers = answer.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        );
        if (cleanAnswers.length > 0) answers[questionId] = cleanAnswers;
      } else if (typeof answer === 'string' && answer.trim()) {
        answers[questionId] = [answer];
      }
    }
    return answers;
  }

  private clearRecaptcha(): void {
    this.recaptchaVerifier?.clear();
    this.recaptchaVerifier = null;
  }
}
