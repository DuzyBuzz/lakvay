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

    expect(root.textContent).toContain('Curated places');
    expect(root.textContent).not.toContain('Development preview');
    expect(root.textContent).toContain('9 places to explore');
    expect(root.textContent).toContain('9 mapped');
    const saveButtons = Array.from(root.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === 'Save',
    );
    expect(saveButtons).toHaveLength(9);
    expect(saveButtons.every((button) => !button.disabled)).toBe(true);

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
        (button) => button.textContent?.trim() === 'Save',
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

  it('should keep merchant and theme controls out of the sidebar', () => {
    const fixture = TestBed.createComponent(DiscoveryPage);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const sidebar = root.querySelector('aside');
    expect(sidebar?.textContent).not.toContain('Are you a merchant?');
    expect(sidebar?.textContent).not.toContain('Theme');
  });
});
