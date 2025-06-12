import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { AuthHeaderComponent } from '../components/auth-header/auth-header.component';

@Component({
  selector: 'app-error',
  imports: [AuthHeaderComponent],
  templateUrl: './error.component.html',
  styleUrl: './error.component.scss'
})
export class ErrorComponent {
  @Input() errorCode: string = '404';
  @Input() errorMessage: string = 'Page Not Found';
  @Input() errorDescription: string = 'The trading opportunity you\'re looking for seems to have moved to a different market.';

  constructor(private router: Router) {}

  goHome(): void {
    this.router.navigate(['/']);
  }

  goBack(): void {
    window.history.back();
  }

  refreshPage(): void {
    window.location.reload();
  }
}
