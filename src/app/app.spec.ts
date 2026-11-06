import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { FirebaseClient } from './core/firebase-client';
import { DiscoveryPage } from './features/discovery/discovery-page/discovery-page';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: FirebaseClient,
          useValue: { configured: false, app: null, auth: null, firestore: null, storage: null },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the discovery experience', async () => {
    const fixture = TestBed.createComponent(DiscoveryPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('input[type="search"]')).not.toBeNull();
    expect(compiled.textContent).toContain('Explore Collections');
  });

  it('shows searchable demo places in development when there are no published listings', () => {
    const fixture = TestBed.createComponent(DiscoveryPage);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const mapButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Map',
    );

    mapButton?.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Sample data');
    expect(root.textContent).not.toContain('Development preview');
    expect(root.textContent).toContain('5 places to explore');
    expect(root.textContent).toContain('5 mapped');
    const sampleButtons = Array.from(root.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === 'Sample',
    );
    expect(sampleButtons).toHaveLength(5);
    expect(sampleButtons.every((button) => button.disabled)).toBe(true);

    const searchInput = root.querySelector(
      'input[placeholder="Search businesses, categories, or address"]',
    ) as HTMLInputElement;
    searchInput.value = 'coffee';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(root.textContent).toContain('2 places to explore');
    expect(root.textContent).toContain('2 mapped');
    expect(
      Array.from(root.querySelectorAll('button')).filter(
        (button) => button.textContent?.trim() === 'Sample',
      ),
    ).toHaveLength(2);
  });

  it('should ask unauthenticated users to sign in before sharing', () => {
    const fixture = TestBed.createComponent(DiscoveryPage);
    fixture.detectChanges();
    const shareButton = fixture.nativeElement.querySelector(
      'button[aria-label="Share a food discovery"]',
    ) as HTMLButtonElement;

    shareButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Welcome back.');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('should show the Firebase setup notice from the merchant entry point', () => {
    const fixture = TestBed.createComponent(DiscoveryPage);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const dashboardButton = Array.from(
      root.querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Go to Dashboard'));

    dashboardButton?.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Firebase is not configured yet.');
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
