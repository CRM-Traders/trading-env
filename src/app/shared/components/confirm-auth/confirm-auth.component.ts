import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-auth',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-auth.component.html',
  styleUrls: ['./confirm-auth.component.scss'],
})
export class ConfirmAuthComponent implements OnInit {
  private _authService = inject(AuthService);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);

  readonly isLoading = signal<boolean>(true);
  readonly isSuccess = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly statusMessage = signal<string>('Validating authentication...');

  ngOnInit(): void {
    this.processAuthConfirmation();
  }

  private processAuthConfirmation(): void {
    const authKey = this._route.snapshot.queryParams['authKey'];

    if (!authKey) {
      this.handleError('No authentication key provided.');
      return;
    }

    this.statusMessage.set('Validating authentication token...');

    this._authService
      .confirmAuth(authKey)
      .pipe(
        catchError((error) => {
          this.handleError(
            error.message || 'Authentication failed. Please try again.'
          );
          return of(null);
        })
      )
      .subscribe({
        next: (authResponse) => {
          if (authResponse) {
            this.handleSuccess();
          }
        },
        error: (error) => {
          console.error('Unexpected error during auth confirmation:', error);
          this.handleError('An unexpected error occurred. Please try again.');
        },
      });
  }

  private handleSuccess(): void {
    this.isLoading.set(false);
    this.isSuccess.set(true);
    this.statusMessage.set('Authentication successful! Redirecting...');

    setTimeout(() => {
      this._router.navigate(['/']);
    }, 1500);
  }

  private handleError(message: string): void {
    this.isLoading.set(false);
    this.isSuccess.set(false);
    this.errorMessage.set(message);
    this.statusMessage.set('Authentication failed');

    // Redirect to login page after a delay
    setTimeout(() => {
      this._router.navigate(['/auth/login']);
    }, 3000);
  }

  // Method to manually redirect to login (for user action)
  redirectToLogin(): void {
    this._router.navigate(['/auth/login']);
  }
}
