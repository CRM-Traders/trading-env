import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

interface NavItem {
  icon: string;
  label: string;
  route: string;
  active?: boolean;
}

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  @Input() isSidebarOpen = false;
  @Input() isMobile = false;
  @Input() navItems: NavItem[] = [];

  @Output() navigateToRoute = new EventEmitter<string>();
  @Output() closeSidebarOnMobile = new EventEmitter<void>();

  onCloseSidebarOnMobile(): void {
    this.closeSidebarOnMobile.emit();
  }
}
