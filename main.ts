import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  FuzzySuggestModal,
  MarkdownRenderer,
  Component,
  FuzzyMatch
} from 'obsidian';

interface CalloutInserterSettings {
  defaultCalloutTypes: string[];
}

const DEFAULT_SETTINGS: CalloutInserterSettings = {
  defaultCalloutTypes: [
    'note',
    'abstract',
    'info',
    'todo',
    'tip',
    'success',
    'question',
    'warning',
    'failure',
    'danger',
    'bug',
    'example',
    'quote',
    'summary'
  ]
};

export default class CalloutInserterPlugin extends Plugin {
  settings: CalloutInserterSettings;
  cssCalloutTypes: string[] = [];

  async onload() {
    await this.loadSettings();

    // Parse callout types from CSS
    this.parseCalloutTypesFromCSS();

    // Add command to insert callout
    this.addCommand({
      id: 'insert-callout',
      name: 'Insert callout...',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        new CalloutSuggestModal(
          this.app,
          editor,
          this.getAvailableCalloutTypes()
        ).open();
      },
      hotkeys: [
        {
          modifiers: ['Mod', 'Shift'],
          key: 'c'
        }
      ]
    });

    // Add settings tab
    this.addSettingTab(new CalloutInserterSettingTab(this.app, this));
  }

  parseCalloutTypesFromCSS() {
    const cssPath = `${this.app.vault.configDir}/snippets/callouts.css`;
    
    this.app.vault.adapter.read(cssPath).then((content) => {
      // Match patterns like [data-callout="TYPE"] or .callout[data-callout="TYPE"]
      const regex = /\[data-callout=["']([^"']+)["']\]/g;
      const matches = content.matchAll(regex);
      const types = new Set<string>();
      
      for (const match of matches) {
        types.add(match[1]);
      }
      
      this.cssCalloutTypes = Array.from(types);
      console.log('Found callout types in CSS:', this.cssCalloutTypes);
    }).catch((err) => {
      console.log('Could not read callouts.css, using defaults:', err);
      this.cssCalloutTypes = [];
    });
  }

  getAvailableCalloutTypes(): string[] {
    // Combine CSS types with default types, remove duplicates
    const combined = [
      ...this.cssCalloutTypes,
      ...this.settings.defaultCalloutTypes
    ];
    return Array.from(new Set(combined)).sort();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class CalloutSuggestModal extends FuzzySuggestModal<string> {
  editor: Editor;
  calloutTypes: string[];
  previewEl: HTMLElement;
  component: Component;
  currentPreviewType: string | null = null;
  observer: MutationObserver;

  constructor(app: App, editor: Editor, calloutTypes: string[]) {
    super(app);
    this.editor = editor;
    this.calloutTypes = calloutTypes;
    this.component = new Component();
    
    this.setPlaceholder('Type to search for a callout type...');
    
    // Create preview container
    this.createPreviewContainer();
  }

  onOpen() {
    super.onOpen();
    
    // Set up a MutationObserver to watch for selection changes (keyboard navigation)
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target as HTMLElement;
          // Check if the element just got selected
          if (target.classList.contains('is-selected')) {
            const type = target.dataset.calloutType;
            if (type) this.updatePreview(type);
          }
        }
      }
    });

    // Start observing the result container for class changes on children
    // this.resultContainerEl comes from the parent SuggestModal class
    this.observer.observe(this.resultContainerEl, { 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['class'] 
    });
  }

  createPreviewContainer() {
    const modalEl = this.modalEl;
    
    this.previewEl = modalEl.createDiv('callout-preview-container');
    
    this.previewEl.style.padding = '1em';
    this.previewEl.style.borderTop = '1px solid var(--background-modifier-border)';
    
    this.previewEl.style.flexShrink = '0'; 
    
    this.previewEl.style.maxHeight = '40vh'; 
    this.previewEl.style.overflowY = 'auto';
    
    this.previewEl.style.minHeight = '130px';
  }

  getItems(): string[] {
    return this.calloutTypes;
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string, evt: MouseEvent | KeyboardEvent) {
    this.insertCallout(item);
  }

  insertCallout(type: string) {
    const cursor = this.editor.getCursor();
    const calloutText = `> [!${type}]\n> `;
    
    this.editor.replaceRange(calloutText, cursor);
    
    const newCursor = {
      line: cursor.line + 1,
      ch: 2
    };
    this.editor.setCursor(newCursor);
    this.editor.focus();
  }

  renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement) {
    const item = match.item;
    
    // 1. Render the text normally
    el.createEl('div', { text: item });

    // 2. Store the item data in the DOM so the Observer can find it later
    el.dataset.calloutType = item;

    // 3. Handle specific mouse hover interaction
    el.addEventListener('mouseenter', () => {
      this.updatePreview(item);
    });

    // 4. Handle the initial selection (when the list first loads)
    // The "is-selected" class is added by Obsidian before this method runs for the first item
    if (el.classList.contains('is-selected')) {
      this.updatePreview(item);
    }
  }

  async updatePreview(type: string) {
    // Prevent unnecessary re-renders
    if (this.currentPreviewType === type) return;
    this.currentPreviewType = type;

    this.previewEl.empty();
    
    const calloutMarkdown = `> [!${type}] ${type.charAt(0).toUpperCase() + type.slice(1)}\n> This is a preview of the ${type} callout.`;
    
    await MarkdownRenderer.render(
      this.app,
      calloutMarkdown,
      this.previewEl,
      '',
      this.component
    );
  }

  onClose() {
    super.onClose();
    this.component.unload();
    // Clean up the observer
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

class CalloutInserterSettingTab extends PluginSettingTab {
  plugin: CalloutInserterPlugin;

  constructor(app: App, plugin: CalloutInserterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Callout Inserter Settings' });

    new Setting(containerEl)
      .setName('Refresh callout types from CSS')
      .setDesc('Re-scan the callouts.css file for available callout types')
      .addButton((button) =>
        button.setButtonText('Refresh').onClick(async () => {
          this.plugin.parseCalloutTypesFromCSS();
          button.setButtonText('Refreshed!');
          setTimeout(() => button.setButtonText('Refresh'), 2000);
        })
      );

    containerEl.createEl('h3', { text: 'Found Callout Types' });
    
    const typesEl = containerEl.createEl('div', { 
      cls: 'callout-types-list',
      text: this.plugin.getAvailableCalloutTypes().join(', ') || 'None found'
    });
    typesEl.style.padding = '1em';
    typesEl.style.backgroundColor = 'var(--background-secondary)';
    typesEl.style.borderRadius = '5px';
  }
}
