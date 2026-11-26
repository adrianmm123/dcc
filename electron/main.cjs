
const {
  app,
  BrowserWindow,
  desktopCapturer,
  session
} = require("electron");

const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
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
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    win.loadURL("http://127.0.0.1:5173");
  }
}

app.whenReady().then(() => {

  // Permissões de câmera e microfone
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = [
        "media",
        "display-capture"
      ];

      callback(allowed.includes(permission));
    }
  );

  // Compartilhamento de tela
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: {
            width: 800,
            height: 600
          }
        });

        if (!sources.length) {
          callback({});
          return;
        }

        callback({
          video: sources[0]
        });

      } catch (error) {
        console.error("Erro na captura de tela:", error);
        callback({});
      }
    },
    {
      useSystemPicker: false
    }
  );

  createWindow();

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
