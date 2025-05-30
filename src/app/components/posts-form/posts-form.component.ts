import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild, WritableSignal } from "@angular/core";
import { SupabaseService } from "../../../services/supabase.service";
import { PostResponse } from "../../../contracts/post/post.response";
import { CommonModule } from "@angular/common";
import { PostComponent } from "../post/post.component";
import { FormsModule } from "@angular/forms";
import { PostRequest } from "../../../contracts/post/post.request";
import { HttpClient } from "@angular/common/http";
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from "rxjs";

// Schnittstelle für die Adressvorschläge
interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

@Component({
  selector: "app-posts-form",
  standalone: true,
  imports: [CommonModule, PostComponent, FormsModule],
  templateUrl: "./posts-form.component.html",
  styleUrl: "./posts-form.component.css",
})
export class PostsFormComponent implements OnInit, OnDestroy {
  @ViewChild("openToJoinInput")
  public openToJoinInput?: ElementRef;
  public shouldShowCreationForm: boolean = false;
  public hasTriedSubmit: boolean = false;
  public showAllPosts: boolean = true;
  public newPost: PostRequest = {
    title: "",
    date: new Date(Date.now()),
    creator_id: "",
  };
  public tagsInput: string = "";

  // Adresssuche
  public addressSuggestions: AddressSuggestion[] = [];
  public isSearching: boolean = false;
  public selectedAddress: AddressSuggestion | null = null;

  // RxJS
  private searchTerms = new Subject<string>();
  private destroy$ = new Subject<void>();

  protected selectedPost: WritableSignal<PostResponse | null> = signal(null);
  protected hasJoinedChat: WritableSignal<boolean> = signal(false);

  constructor(
    private readonly subabaseService: SupabaseService,
    private readonly http: HttpClient
  ) {}
  async ngOnInit(): Promise<void> {
    // Adresssuche mit Debouncing einrichten
    this.searchTerms
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500), // 500ms (0,5 Sekunden) warten nach Eingabe
        distinctUntilChanged() // Nur wenn sich der Text geändert hat
      )
      .subscribe((term) => {
        this.performAddressSearch(term);
      });

    //check whether a posts uuid is passed in the url and set showAllPosts to false or true
    // const url = location.href;
    // const url = location.href;

    //url http://localhost:4200/posts/ca8e2846-64b4-4026-8cdd-f8db024aa724

    const url = location.pathname;
    const regex = /\/posts\/([a-zA-Z0-9-]+)/;
    const match = url.match(regex);
    if (match) {
      const postId = match[1];
      console.log("Post ID:", postId);
      this.showAllPosts = false;

      const post = await this.getPostById(postId);
      this.selectedPost.set(post);

      const hasJoinedChat = await this.subabaseService.getPostController().hasJoinedPostChat(postId);
      this.hasJoinedChat.set(hasJoinedChat);
    }
  }

  ngOnDestroy(): void {
    // RxJS Subscriptions aufräumen
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected toggleForm() {
    this.shouldShowCreationForm = !this.shouldShowCreationForm;
  }
  protected async createPost() {
    this.hasTriedSubmit = true;
    if (!this.newPost.title || !this.newPost.location || !this.tagsInput || !this.newPost.date) {
      return;
    }

    const user = await this.subabaseService.supabaseClient?.auth.getUser();
    const userId = user?.data.user?.id;
    if (!userId) {
      return;
    }
    this.newPost.open_to_join = (this.openToJoinInput?.nativeElement as HTMLInputElement).checked;
    this.newPost.creator_id = userId;
    let tags = this.tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    console.log(this.newPost);

    // this.newPost.latitude = this.selectedAddress ? parseFloat(this.selectedAddress.lat) : undefined;
    // this.newPost.longitude = this.selectedAddress ? parseFloat(this.selectedAddress.lon) : undefined;
    const numberLongitude = this.selectedAddress ? parseFloat(this.selectedAddress.lon) : undefined;
    const numberLatitude = this.selectedAddress ? parseFloat(this.selectedAddress.lat) : undefined;
    if (numberLongitude !== undefined && numberLatitude !== undefined) {
      this.newPost.latitude = numberLatitude;
      this.newPost.longitude = numberLongitude;
      // console.log(`Geokoordinaten: ${this.newPost.geo_data}`);
    } else {
    }
    // Ausgabe der Geokoordinaten vor dem Speichern
    if (this.newPost) {
      // console.log(`Post wird erstellt mit Geokoordinaten: ${this.newPost.geo_data}`);
    } else {
      console.log("Post wird ohne Geokoordinaten erstellt");
    }

    await this.subabaseService.getPostController().createPost({
      ...this.newPost,
      tags,
    });

    this.resetForm();
    this.shouldShowCreationForm = false;
  }

  private resetForm() {
    this.newPost = {
      creator_id: "",
      date: new Date(Date.now()),
      title: "",
      tags: [],
      location: "",
      description: "",
      open_to_join: false,
      // geo_data: null,
    };
    this.tagsInput = "";
    this.selectedAddress = null;
  }

  protected getPosts(): PostResponse[] {
    return this.subabaseService.getPostController().posts();
  }
  protected async getPostById(postId: string): Promise<PostResponse | null> {
    return await this.subabaseService.getPostController().loadPostById(postId);
  }
  protected readonly JSON = JSON;
  /**
   * Gibt den Suchbegriff an das RxJS Subject weiter
   * @param searchText Der Suchtext für die Adresse
   */
  public searchAddress(searchText: string): void {
    this.searchTerms.next(searchText);
  }
  /**
   * Führt die tatsächliche Adresssuche durch
   * @param searchText Der Suchtext für die Adresse
   */ private performAddressSearch(searchText: string): void {
    // Wenn der Suchtext leer ist oder weniger als 3 Zeichen hat, zeige keine Vorschläge
    // Leerzeichen werden ignoriert bei der Zählung
    const textWithoutSpaces = searchText ? searchText.replace(/\s/g, "") : "";
    if (!textWithoutSpaces || textWithoutSpaces.length < 3) {
      this.addressSuggestions = [];
      return;
    }

    // Suchstatus setzen
    this.isSearching = true;

    // Nominatim API für die Adresssuche verwenden (OpenStreetMap)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchText)}&format=json&addressdetails=1&limit=5`;

    this.http.get<AddressSuggestion[]>(url).subscribe({
      next: (results) => {
        this.addressSuggestions = results;
        this.isSearching = false;
      },
      error: (error) => {
        console.error("Fehler bei der Adresssuche:", error);
        this.addressSuggestions = [];
        this.isSearching = false;
      },
    });
  }
  /**
   * Wählt einen Adressvorschlag aus und setzt ihn als Standort
   * @param suggestion Der ausgewählte Adressvorschlag
   */
  public selectAddress(suggestion: AddressSuggestion): void {
    this.selectedAddress = suggestion;
    this.newPost.location = suggestion.display_name;
    this.newPost.longitude = parseFloat(suggestion.lon); // Longitude speichern
    this.newPost.latitude = parseFloat(suggestion.lat); // Latitude speichern
    // Koordinaten speichern

    /*

    Example: const { error } = await supabase.from('restaurants').insert([
  {
    name: 'Supa Burger',
    location: 'POINT(-73.946823 40.807416)',
  },
  {
    name: 'Supa Pizza',
    location: 'POINT(-73.94581 40.807475)',
  },
  {
    name: 'Supa Taco',
    location: 'POINT(-73.945826 40.80629)',
  },
])


    */

    console.log(`Adresse ausgewählt: ${suggestion.display_name}`);
    console.log(`Geokoordinaten: Lat ${suggestion.lat}, Lng ${suggestion.lon}`);

    this.addressSuggestions = []; // Vorschläge ausblenden
  }

  async showPostDetail(post: PostResponse) {
    this.selectedPost.set(post);

    const hasJoinedChat = await this.subabaseService.getPostController().hasJoinedPostChat(post.id);
    this.hasJoinedChat.set(hasJoinedChat);
  }

  closePostDetail() {
    this.selectedPost.set(null);
    this.showAllPosts = true;
  }
  protected async joinPost() {
    const postId = this.selectedPost()?.id;
    if (!postId) {
      return;
    }

    await this.subabaseService.getPostController().joinPostChat(postId);
    // this.hasJoinedChat.set(true);
  }
}
