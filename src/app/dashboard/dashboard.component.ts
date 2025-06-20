import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header/header.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';

interface NavItem {
  icon: string;
  label: string;
  route: string;
  active?: boolean;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterOutlet, HeaderComponent, SidebarComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  isSidebarOpen = false;
  isMobile = false;
  isUserDropdownOpen = false;
  pageTitle = 'Dashboard';

  // User information
  userName = 'John Doe';
  userEmail = 'john.doe@example.com';
  userInitials = 'JD';

  navItems: NavItem[] = [
    { icon: 'trending_up', label: 'Trading', route: '/trading' },
    // { icon: 'pie_chart', label: 'Portfolio', route: '/portfolio' },
    // { icon: 'history', label: 'History', route: '/history' },
  ];

  constructor(private router: Router) {
    this.checkScreenSize();
  }

  ngOnInit(): void {
    this.updateActiveNavItem();
    window.addEventListener('resize', () => this.checkScreenSize());
  }

  checkScreenSize(): void {
    this.isMobile = window.innerWidth < 768;
    if (this.isMobile) {
      this.isSidebarOpen = false;
    }
  }

  onToggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  onToggleUserDropdown(): void {
    this.isUserDropdownOpen = !this.isUserDropdownOpen;
  }

  onNavigateToRoute(route: string): void {
    this.router.navigate([route]);
    this.updateActiveNavItem();

    if (this.isMobile) {
      this.isSidebarOpen = false;
    }
  }

  updateActiveNavItem(): void {
    const currentRoute = this.router.url;
    this.navItems.forEach((item) => {
      item.active = currentRoute.includes(item.route);
    });
  }

  onCloseSidebarOnMobile(): void {
    if (this.isMobile) {
      this.isSidebarOpen = false;
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(): void {
    this.checkScreenSize();
  }
}
