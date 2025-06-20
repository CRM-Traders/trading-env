import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
} from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-header',
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  authService = inject(AuthService);

  title = 'Dashboard';
  @Input() isUserDropdownOpen = false;
  userName = this.authService.getName();
  userEmail = this.authService.getRole();
  userInitials =
    this.userName[0].toUpperCase() + this.userName[1].toUpperCase();

  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() toggleUserDropdown = new EventEmitter<void>();

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  onToggleUserDropdown(): void {
    this.toggleUserDropdown.emit();
  }

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  closeDropdownOnOutsideClick(event: Event) {
    const target = event.target as HTMLElement;
    const dropdown = document.querySelector('.user-dropdown-container');

    if (dropdown && !dropdown.contains(target) && this.isUserDropdownOpen) {
      this.toggleUserDropdown.emit();
    }
  }
}
