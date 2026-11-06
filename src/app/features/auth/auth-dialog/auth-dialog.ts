import { NgOptimizedImage } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { AccountType, Auth } from '../../../core/auth';
import { FirebaseClient } from '../../../core/firebase-client';

@Component({
  imports: [NgOptimizedImage],
  selector: 'app-auth-dialog',
  styles: ``,
  templateUrl: './auth-dialog.html',
})
export class AuthDialog {
  private readonly auth = inject(Auth);
  private readonly firebase = inject(FirebaseClient);

  readonly closed = output<void>();
  readonly authenticated = output<void>();
  readonly accountType = input<AccountType>('consumer');
  protected readonly method = signal<'email' | 'phone'>('email');
  protected readonly mode = signal<'sign-in' | 'create-account'>('sign-in');
  protected readonly verificationSent = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly isConfigured = this.firebase.configured;

  protected setMethod(method: 'email' | 'phone'): void {
    this.error.set('');
    this.method.set(method);
    this.auth.clearPhoneVerification();
    this.verificationSent.set(false);
  }

  protected setMode(mode: 'sign-in' | 'create-account'): void {
    this.error.set('');
    this.mode.set(mode);
  }

  protected async signInWithGoogle(): Promise<void> {
    await this.runAuthAction(() => this.auth.signInWithGoogle(this.accountType()));
  }

  protected async signInWithFacebook(): Promise<void> {
    await this.runAuthAction(() => this.auth.signInWithFacebook(this.accountType()));
  }

  protected async submitEmail(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    const values = new FormData(form);
    const email = this.formValue(values, 'email');
    const password = this.formValue(values, 'password');
    const action =
      this.mode() === 'create-account'
        ? () =>
            this.auth.createEmailAccount(
              this.formValue(values, 'displayName'),
              email,
              password,
              this.accountType(),
            )
        : () => this.auth.signInWithEmail(email, password, this.accountType());

    await this.runAuthAction(action);
  }

  protected async requestPhoneCode(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const phoneNumber = this.formValue(new FormData(form), 'phone');

    await this.runAuthAction(async () => {
      await this.auth.sendPhoneCode(phoneNumber, 'recaptcha-container', this.accountType());
      this.verificationSent.set(true);
    });
  }

  protected async confirmPhoneCode(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const code = this.formValue(new FormData(form), 'verificationCode');
    await this.runAuthAction(() => this.auth.confirmPhoneCode(code));
  }

  protected close(): void {
    this.auth.clearPhoneVerification();
    this.closed.emit();
  }

  private async runAuthAction(action: () => Promise<void>): Promise<void> {
    if (!this.isConfigured) {
      this.error.set('Add your Firebase web app settings to enable sign-in.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.authenticated.emit();
      this.close();
    } catch (reason) {
      this.error.set(this.auth.errorMessage(reason));
    } finally {
      this.busy.set(false);
    }
  }

  private formValue(values: FormData, key: string): string {
    const value = values.get(key);
    return typeof value === 'string' ? value : '';
  }
}
