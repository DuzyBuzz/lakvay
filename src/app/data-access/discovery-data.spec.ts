import { TestBed } from '@angular/core/testing';
import { DiscoveryData } from './discovery-data';

describe('DiscoveryData', () => {
  let service: DiscoveryData;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DiscoveryData);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
