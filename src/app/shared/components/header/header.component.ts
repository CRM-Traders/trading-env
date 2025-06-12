import { Component, HostListener, OnInit, OnDestroy, ElementRef, Renderer2 } from '@angular/core';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit, OnDestroy {
  isMobileMenuOpen = false;
  isScrolled = false;
  scrollProgress = 0;
  private scrollThreshold = 50;
  private maxScrollForEffect = 200; // Maximum scroll distance for calculating progress

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnInit() {
    this.checkScrollPosition();
  }

  ngOnDestroy() {
    // Cleanup handled automatically by @HostListener
  }

  @HostListener('window:scroll', ['$event'])
  onWindowScroll() {
    this.checkScrollPosition();
    this.updateScrollProgress();
  }

  private checkScrollPosition() {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const wasScrolled = this.isScrolled;
    this.isScrolled = scrollPosition > this.scrollThreshold;

    // Add CSS custom properties for advanced styling
    if (this.isScrolled !== wasScrolled) {
      const navElement = this.el.nativeElement.querySelector('nav');
      if (navElement) {
        this.renderer.setStyle(navElement, '--scroll-opacity', this.isScrolled ? '1' : '0');
      }
    }
  }

  private updateScrollProgress() {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    this.scrollProgress = Math.min(scrollPosition / this.maxScrollForEffect, 1);

    // Update CSS custom property for dynamic effects
    const navElement = this.el.nativeElement.querySelector('nav');
    if (navElement) {
      this.renderer.setStyle(navElement, '--scroll-progress', this.scrollProgress.toString());
    }
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }

  onNavItemClick() {
    this.closeMobileMenu();
  }

  // Additional method for programmatic scroll behavior
  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
