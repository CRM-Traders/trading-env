import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// notification.service.ts
export interface NotificationOptions {
  duration?: number;
  type?: 'success' | 'error' | 'warning' | 'info';
  persistent?: boolean;
}

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  timestamp: Date;
  persistent: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly notificationsSubject = new BehaviorSubject<Notification[]>(
    []
  );
  public readonly notifications$ = this.notificationsSubject.asObservable();

  /**
   * Show a success notification
   */
  showSuccess(message: string, options?: NotificationOptions): void {
    this.addNotification(message, 'success', options);
  }

  /**
   * Show an error notification
   */
  showError(message: string, options?: NotificationOptions): void {
    this.addNotification(message, 'error', { ...options, persistent: true });
  }

  /**
   * Show a warning notification
   */
  showWarning(message: string, options?: NotificationOptions): void {
    this.addNotification(message, 'warning', options);
  }

  /**
   * Show an info notification
   */
  showInfo(message: string, options?: NotificationOptions): void {
    this.addNotification(message, 'info', options);
  }

  /**
   * Remove a notification
   */
  removeNotification(id: string): void {
    const currentNotifications = this.notificationsSubject.value;
    const updatedNotifications = currentNotifications.filter(
      (n) => n.id !== id
    );
    this.notificationsSubject.next(updatedNotifications);
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notificationsSubject.next([]);
  }

  private addNotification(
    message: string,
    type: Notification['type'],
    options?: NotificationOptions
  ): void {
    const notification: Notification = {
      id: this.generateId(),
      message,
      type,
      timestamp: new Date(),
      persistent: options?.persistent || false,
    };

    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next([...currentNotifications, notification]);

    // Auto-remove non-persistent notifications
    if (!notification.persistent) {
      const duration = options?.duration || (type === 'error' ? 5000 : 3000);
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, duration);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
