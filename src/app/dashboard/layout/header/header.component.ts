import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-header',
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  @Input() title = 'Dashboard';
  @Input() isUserDropdownOpen = false;
  @Input() userName = 'John Doe';
  @Input() userEmail = 'john.doe@example.com';
  @Input() userInitials = 'JD';

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
