import { inject, Inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private readonly _apiUrl = environment.gatewayDomain;
  private _http = inject(HttpClient);

  get<T>(
    endpoint: string,
    params?: HttpParams,
    headers?: HttpHeaders
  ): Observable<T> {
    return this._http.get<T>(`${this._apiUrl}/${endpoint}`, {
      params: params,
      headers: headers,
    });
  }

  getFile(endpoint: string): Observable<Blob> {
    return this._http.get(`${this._apiUrl}/${endpoint}`, {
      responseType: 'blob',
    });
  }
  post<T>(
    endpoint: string,
    body: any,
    params?: HttpParams,
    headers?: HttpHeaders
  ): Observable<T> {
    return this._http.post<T>(`${this._apiUrl}/${endpoint}`, body, {
      params: params,
      headers: headers,
    });
  }

  postForm<T>(
    endpoint: string,
    formData: URLSearchParams | FormData,
    params?: HttpParams,
    headers?: HttpHeaders
  ): Observable<T> {
    let body: string | FormData;
    let finalHeaders = headers;

    if (formData instanceof FormData) {
      body = formData;
    } else {
      body = formData.toString();
      const defaultHeaders = new HttpHeaders({
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      finalHeaders = headers ? headers : defaultHeaders;
    }

    return this._http.post<T>(`${this._apiUrl}/${endpoint}`, body, {
      params: params,
      headers: finalHeaders,
    });
  }

  patch<T>(
    endpoint: string,
    body: any,
    params?: HttpParams,
    headers?: HttpHeaders
  ): Observable<T> {
    return this._http.patch<T>(`${this._apiUrl}/${endpoint}`, body, {
      params: params,
      headers: headers,
    });
  }

  put<T>(
    endpoint: string,
    body: any,
    params?: HttpParams,
    headers?: HttpHeaders
  ): Observable<T> {
    return this._http.put<T>(`${this._apiUrl}/${endpoint}`, body, {
      params: params,
      headers: headers,
    });
  }

  delete<T>(
    endpoint: string,
    params?: HttpParams,
    headers?: HttpHeaders
  ): Observable<T> {
    return this._http.delete<T>(`${this._apiUrl}/${endpoint}`, {
      params: params,
      headers: headers,
    });
  }
}
