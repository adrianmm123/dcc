
const {
  app,
  BrowserWindow,
  desktopCapturer,
  session,
  dialog
} = require("electron");

const { autoUpdater } = require("electron-updater");
const path = require("path");

let mainWindow;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "NEXUS",
    backgroundColor: "#111116",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    mainWindow.loadURL("http://127.0.0.1:5173");
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.on("checking-for-update", () => {
    console.log("Verificando atualizações...");
  });

  autoUpdater.on("update-available", () => {
    console.log("Nova atualização encontrada!");
  });

  autoUpdater.on("update-not-available", () => {
    console.log("NEXUS já está atualizado.");
  });

  autoUpdater.on("error", (error) => {
    console.error("Erro ao atualizar:", error);
  });

  autoUpdater.on("update-downloaded", async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização do NEXUS",
      message: "Uma nova versão do NEXUS está pronta!",
      detail: "Deseja reiniciar o aplicativo para instalar a atualização?",
      buttons: ["Atualizar agora", "Mais tarde"],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("Não foi possível verificar atualizações:", error);
    });
  }, 5000);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(["media", "display-capture"].includes(permission));
    }
  );

  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 800, height: 600 }
        });

        if (!sources.length) {
          callback({});
          return;
        }

        callback({ video: sources[0] });
      } catch (error) {
        console.error("Erro na captura de tela:", error);
        callback({});
      }
    },
    { useSystemPicker: false }
  );

  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
