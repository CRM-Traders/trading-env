import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TradingFormComponent } from './trading-form.component';

describe('TradingFormComponent', () => {
  let component: TradingFormComponent;
  let fixture: ComponentFixture<TradingFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TradingFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TradingFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
