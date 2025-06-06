import { Component, ElementRef, signal, ViewChild, WritableSignal } from "@angular/core";
import { SupabaseService } from "../../../services/supabase.service";
import { UserRegistrationResponse } from "../../../contracts/user/user-registration.response";
import { Router } from "@angular/router";
import { ROUTE_MAP } from "../../../constants/route.constants";
import { NgClass } from "@angular/common";

@Component({
  selector: "app-user-registration-form",
  imports: [NgClass],
  templateUrl: "./user-registration-form.component.html",
  styleUrl: "./user-registration-form.component.css",
})
export class UserRegistrationFormComponent {
  // Use signal to instantly update view
  protected readonly response: WritableSignal<UserRegistrationResponse | undefined>;

  protected email?: string;
  protected name?: string;
  protected password?: string;
  protected hasTriedSubmit: boolean = false;
  protected showPassword: boolean = false;

  @ViewChild("passwordInput")
  public passwordInput?: ElementRef;

  constructor(
    protected readonly supabaseService: SupabaseService,
    private readonly router: Router
  ) {
    this.response = signal(undefined);
  }

  handleMailInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.email = target.value;
  }

  handleNameInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.name = target.value;
  }

  handlePasswordInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.password = target.value;
  }

  async registerUser() {
    if (!this.name || !this.email || !this.password) {
      return;
    }

    const response = await this.supabaseService.getUserController().signUpUser(this.name, this.email, this.password);
    if (!response.error) {
      await this.router.navigate(["/", ROUTE_MAP]);
      return;
    }

    this.response.set(response);
  }

  handleSubmit() {
    this.hasTriedSubmit = true;
    return this.registerUser();
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
    (this.passwordInput?.nativeElement as HTMLInputElement).type = this.showPassword ? "text" : "password";
  }
}
