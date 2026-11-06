import { TestBed } from '@angular/core/testing';
import { MediaStorage } from './media-storage';

describe('MediaStorage', () => {
  let service: MediaStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MediaStorage);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('accepts supported image and video formats', () => {
    expect(() =>
      service.validatePostMedia(new File(['image'], 'image.png', { type: 'image/png' })),
    ).not.toThrow();
    expect(() =>
      service.validatePostMedia(new File(['video'], 'video.mp4', { type: 'video/mp4' })),
    ).not.toThrow();
  });

  it('rejects unsupported formats', () => {
    expect(() =>
      service.validatePostMedia(new File(['document'], 'notes.txt', { type: 'text/plain' })),
    ).toThrow('Choose a JPG, PNG, WebP, MP4, or WebM file.');
  });

  it('rejects images larger than 10 MB', () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    });
    expect(() => service.validatePostMedia(file)).toThrow('Images must be 10 MB or smaller.');
  });
});
