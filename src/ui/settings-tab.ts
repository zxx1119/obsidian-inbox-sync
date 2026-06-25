import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import InboxSyncPlugin from "../main";
import { uiT } from "../i18n";

/**
 * 插件设置页面
 */
export class InboxSyncSettingTab extends PluginSettingTab {
  plugin: InboxSyncPlugin;
  private testingConnection = false;

  constructor(app: App, plugin: InboxSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 标题和说明
    new Setting(containerEl).setName(uiT("title")).setHeading();
    containerEl.createEl("p", { text: uiT("description") });

    // ========== 云存储配置 ==========
    new Setting(containerEl)
      .setName(uiT("storageType"))
      .setDesc(uiT("storageTypeDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("webdav", "WebDAV")
          .addOption("s3", uiT("s3Option"))
          .setValue(this.plugin.settings.storageType)
          .onChange(async (value: "webdav" | "s3") => {
            this.plugin.settings.storageType = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // ========== WebDAV 配置 ==========
    if (this.plugin.settings.storageType === "webdav") {
      new Setting(containerEl).setName(uiT("webdavTitle")).setHeading();

      new Setting(containerEl)
        .setName(uiT("webdavUrl"))
        .setDesc(uiT("webdavUrlDesc"))
        .addText((text) =>
          text
            .setPlaceholder("https://dav.example.com")
            .setValue(this.plugin.settings.webdavUrl)
            .onChange(async (value) => {
              this.plugin.settings.webdavUrl = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName(uiT("webdavUsername"))
        .setDesc(uiT("webdavUsernameDesc"))
        .addText((text) =>
          text
            .setPlaceholder("username")
            .setValue(this.plugin.settings.webdavUsername)
            .onChange(async (value) => {
              this.plugin.settings.webdavUsername = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName(uiT("webdavPassword"))
        .setDesc(uiT("webdavPasswordDesc"))
        .addText((text) => {
          text.inputEl.type = "password";
          text
            .setPlaceholder("••••••••")
            .setValue(this.plugin.settings.webdavPassword)
            .onChange(async (value) => {
              this.plugin.settings.webdavPassword = value;
              await this.plugin.saveSettings();
            });
        });

      this.addTestConnectionButton(containerEl);
    }

    // ========== S3 配置 ==========
    if (this.plugin.settings.storageType === "s3") {
      new Setting(containerEl).setName(uiT("s3Title")).setHeading();

      new Setting(containerEl)
        .setName(uiT("s3Endpoint"))
        .setDesc(uiT("s3EndpointDesc"))
        .addText((text) =>
          text
            .setPlaceholder("https://s3.example.com")
            .setValue(this.plugin.settings.s3Endpoint)
            .onChange(async (value) => {
              this.plugin.settings.s3Endpoint = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName(uiT("s3AccessKey"))
        .setDesc(uiT("s3AccessKeyDesc"))
        .addText((text) =>
          text
            .setPlaceholder("access-key")
            .setValue(this.plugin.settings.s3AccessKey)
            .onChange(async (value) => {
              this.plugin.settings.s3AccessKey = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName(uiT("s3SecretKey"))
        .setDesc(uiT("s3SecretKeyDesc"))
        .addText((text) => {
          text.inputEl.type = "password";
          text
            .setPlaceholder("••••••••")
            .setValue(this.plugin.settings.s3SecretKey)
            .onChange(async (value) => {
              this.plugin.settings.s3SecretKey = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName(uiT("s3Bucket"))
        .setDesc(uiT("s3BucketDesc"))
        .addText((text) =>
          text
            .setPlaceholder("my-bucket")
            .setValue(this.plugin.settings.s3Bucket)
            .onChange(async (value) => {
              this.plugin.settings.s3Bucket = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName(uiT("s3Region"))
        .setDesc(uiT("s3RegionDesc"))
        .addText((text) =>
          text
            .setPlaceholder("us-east-1")
            .setValue(this.plugin.settings.s3Region)
            .onChange(async (value) => {
              this.plugin.settings.s3Region = value;
              await this.plugin.saveSettings();
            })
        );

      this.addTestConnectionButton(containerEl);
    }

    // ========== 同步设置 ==========
    new Setting(containerEl).setName(uiT("syncTitle")).setHeading();

    new Setting(containerEl)
      .setName(uiT("vaultFolder"))
      .setDesc(uiT("vaultFolderDesc"))
      .addText((text) =>
        text
          .setPlaceholder("inBox")
          .setValue(this.plugin.settings.vaultFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.vaultFolderPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(uiT("autoSync"))
      .setDesc(uiT("autoSyncDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoSync)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoSync = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(uiT("syncInterval"))
      .setDesc(uiT("syncIntervalDesc"))
      .addSlider((slider) =>
        slider
          .setLimits(5, 120, 5)
          .setValue(this.plugin.settings.syncInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.syncInterval = value;
            await this.plugin.saveSettings();
          })
      );

    // ========== 高级选项 ==========
    new Setting(containerEl).setName(uiT("advancedTitle")).setHeading();

    new Setting(containerEl)
      .setName(uiT("frontmatterTags"))
      .setDesc(uiT("frontmatterTagsDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableFrontmatterTags)
          .onChange(async (value) => {
            this.plugin.settings.enableFrontmatterTags = value;
            await this.plugin.saveSettings();
          })
      );

    // 注：preserveContentTags 和 conflictResolution 选项已移除（代码未实现）
    // 旧 data.json 里的对应字段保留但不再生效，避免破坏现有配置文件

    // ========== 笔记组织方式 ==========
    new Setting(containerEl).setName(uiT("organizeTitle")).setHeading();

    new Setting(containerEl)
      .setName(uiT("organizeByTag"))
      .setDesc(uiT("organizeByTagDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.organizeByTag)
          .onChange(async (value) => {
            this.plugin.settings.organizeByTag = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(uiT("tagFolderRoot"))
      .setDesc(uiT("tagFolderRootDesc"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.tagFolderRoot)
          .onChange(async (value) => {
            this.plugin.settings.tagFolderRoot = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(uiT("inlineAnnotations"))
      .setDesc(uiT("inlineAnnotationsDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.inlineAnnotations)
          .onChange(async (value) => {
            this.plugin.settings.inlineAnnotations = value;
            await this.plugin.saveSettings();
          })
      );
  }

  /**
   * 添加测试连接按钮
   */
  private addTestConnectionButton(containerEl: HTMLElement): void {
    const statusEl = containerEl.createEl("div", {
      cls: "inbox-connection-status",
    });

    new Setting(containerEl)
      .setName(uiT("testConnection"))
      .setDesc(uiT("testConnectionDesc"))
      .addButton((button) =>
        button
          .setButtonText(uiT("testConnection"))
          .setDisabled(this.testingConnection)
          .onClick(async () => {
            if (this.testingConnection) return;

            this.testingConnection = true;
            button.setButtonText(uiT("testing"));
            button.setDisabled(true);
            statusEl.textContent = "";
            statusEl.className = "inbox-connection-status";

            try {
              this.plugin.syncManager.flushSettings();
              const result = await this.plugin.syncManager.testConnection();

              if (result.success) {
                statusEl.textContent = uiT("connectionSuccess");
                statusEl.className = "inbox-connection-status inbox-status-success";
                new Notice(uiT("noticeSuccess"));
              } else {
                statusEl.textContent = uiT("connectionFailed") + result.error;
                statusEl.className = "inbox-connection-status inbox-status-error";
                new Notice(uiT("noticeFailed") + result.error);
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              statusEl.textContent = uiT("connectionFailed") + errorMsg;
              statusEl.className = "inbox-connection-status inbox-status-error";
              new Notice(uiT("noticeFailed") + errorMsg);
            } finally {
              this.testingConnection = false;
              button.setButtonText(uiT("testConnection"));
              button.setDisabled(false);
            }
          })
      );

    statusEl.textContent = "";
  }
}
