
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { Room, RoomEvent, Track, VideoPresets } from "livekit-client";
import {
  MessageCircle, Headphones, Settings, Plus, Compass, Search, Bell,
  Pin, Smile, Image, Send, Mic, MicOff, Video, VideoOff, MonitorUp,
  Phone, Users, Hash, ChevronDown, Menu, LogOut, X, Maximize2,
  Minimize2, Volume2, Save, Pencil, Camera
} from "lucide-react";
import "./App.css";

const initialServers = [
  { id: 1, name: "NEXUS", color: "#8b5cf6", letter: "N" },
  { id: 2, name: "Gaming", color: "#ec4899", letter: "G" },
  { id: 3, name: "Amigos", color: "#06b6d4", letter: "A" },
];

function formatMessage(row, currentUserId) {
  return {
    id: row.id,
    userId: row.user_id,
    isMine: row.user_id === currentUserId,
    time: new Date(row.created_at).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    text: row.content,
  };
}

function getInitial(name) {
  return (name || "U").trim().charAt(0).toUpperCase();
}

function ParticipantTile({ participant, onFullscreen }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !participant.track) return;

    participant.track.attach(element);

    return () => {
      participant.track?.detach(element);
    };
  }, [participant.track]);

  return (
    <div
      className={`participant-tile ${
        participant.isSpeaking ? "speaking" : ""
      } ${participant.isScreen ? "screen-tile" : ""}`}
    >
      {participant.track ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
        />
      ) : (
        <div className="participant-avatar">
          {getInitial(participant.name)}
        </div>
      )}

      {participant.isScreen && (
        <button
          className="screen-fullscreen-button"
          onClick={() => onFullscreen(videoRef.current?.parentElement)}
          title="Tela cheia"
        >
          <Maximize2 size={16} />
        </button>
      )}

      <div className="participant-label">
        <span>
          {participant.name}
          {participant.isLocal ? " (Você)" : ""}
          {participant.isScreen ? " • Tela" : ""}
        </span>

        {!participant.isScreen && (
          <span
            className={`mic-indicator ${
              participant.isMicrophoneEnabled ? "mic-active" : "mic-muted"
            }`}
          >
            {participant.isMicrophoneEnabled ? (
              <Mic size={14} />
            ) : (
              <MicOff size={14} />
            )}
          </span>
        )}
      </div>

      {participant.isScreen && (
        <div className="screen-label">
          <MonitorUp size={13} /> Compartilhando tela
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  const [server, setServer] = useState(initialServers[0]);
  const [channel, setChannel] = useState("geral");
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [message, setMessage] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [showMembers, setShowMembers] = useState(true);

  const [room, setRoom] = useState(null);
  const [voiceRoomName, setVoiceRoomName] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Não conectado");
  const [voiceError, setVoiceError] = useState("");
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareAudio, setShareAudio] = useState(true);
  const [participants, setParticipants] = useState([]);
  const [callBusy, setCallBusy] = useState(false);
  const [showCall, setShowCall] = useState(true);

  // Configurações de dispositivos e perfil.
  const [devices, setDevices] = useState({
    microphones: [],
    speakers: [],
    cameras: [],
  });
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  const username =
    profiles[session?.user?.id]?.username ||
    session?.user?.user_metadata?.username ||
    "Usuário";

  // Carrega microfones, saídas de áudio e câmeras disponíveis.
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const all = await navigator.mediaDevices.enumerateDevices();

      setDevices({
        microphones: all.filter((d) => d.kind === "audioinput"),
        speakers: all.filter((d) => d.kind === "audiooutput"),
        cameras: all.filter((d) => d.kind === "videoinput"),
      });

      setSelectedMic((current) =>
        current || all.find((d) => d.kind === "audioinput")?.deviceId || ""
      );
      setSelectedSpeaker((current) =>
        current || all.find((d) => d.kind === "audiooutput")?.deviceId || ""
      );
      setSelectedCamera((current) =>
        current || all.find((d) => d.kind === "videoinput")?.deviceId || ""
      );
    } catch (error) {
      console.error("Não foi possível listar os dispositivos:", error);
    }
  }, []);

  useEffect(() => {
    refreshDevices();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;

    mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      mediaDevices.removeEventListener("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

  // Aplica a saída de áudio escolhida aos áudios recebidos.
  useEffect(() => {
    if (!selectedSpeaker) return;

    document.querySelectorAll("audio[data-participant]").forEach((audio) => {
      if (typeof audio.setSinkId === "function") {
        audio.setSinkId(selectedSpeaker).catch((error) => {
          console.warn("Não foi possível trocar a saída de áudio:", error);
        });
      }
    });
  }, [selectedSpeaker, room]);

  // Atualiza a lista de participantes e transmissões.
  const updateParticipants = useCallback(
    (currentRoom) => {
      if (!currentRoom) {
        setParticipants([]);
        return;
      }

      const list = [];

      const addParticipant = (participant, isLocal) => {
        const identity = participant.identity;
        const profileName = profiles[identity]?.username;
        const liveKitName = participant.name;

        const displayName =
          profileName ||
          (liveKitName && liveKitName !== identity ? liveKitName : "") ||
          (isLocal ? username : "Participante");

        const base = {
          id: identity,
          name: displayName,
          isLocal,
          isSpeaking: Boolean(participant.isSpeaking),
          isMicrophoneEnabled: Boolean(participant.isMicrophoneEnabled),
        };

        let hasCamera = false;

        participant.videoTrackPublications.forEach((publication) => {
          if (!publication.track || !publication.isSubscribed && !isLocal) {
            return;
          }

          if (publication.source === Track.Source.Camera) {
            hasCamera = true;
            list.push({
              ...base,
              id: `${identity}-camera`,
              track: publication.track,
              isScreen: false,
            });
          }

          if (publication.source === Track.Source.ScreenShare) {
            list.push({
              ...base,
              id: `${identity}-screen`,
              track: publication.track,
              isScreen: true,
            });
          }
        });

        if (!hasCamera) {
          list.push({
            ...base,
            id: `${identity}-avatar`,
            track: null,
            isScreen: false,
          });
        }
      };

      if (currentRoom.localParticipant) {
        addParticipant(currentRoom.localParticipant, true);
      }

      currentRoom.remoteParticipants.forEach((participant) => {
        addParticipant(participant, false);
      });

      setParticipants(list);
    },
    [profiles, username]
  );

  // Autenticação.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data?.session ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Carrega o perfil do usuário.
  useEffect(() => {
    if (!session?.user?.id) {
      setProfiles({});
      return;
    }

    let active = true;

    async function loadOwnProfile() {
      const userId = session.user.id;
      const metadataName = session.user.user_metadata?.username?.trim();

      const { data: existing, error: selectError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (selectError) {
        console.error("Erro ao buscar perfil:", selectError.message);
      }

      let profile = existing;

      if (metadataName && !existing?.username) {
        const { data, error } = await supabase
          .from("profiles")
          .upsert(
            { id: userId, username: metadataName },
            { onConflict: "id" }
          )
          .select("id, username, avatar_url")
          .single();

        if (!error && data) profile = data;
      } else if (!existing) {
        const { data, error } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            username: metadataName || "Usuário",
          })
          .select("id, username, avatar_url")
          .single();

        if (!error && data) profile = data;
      }

      if (active && profile) {
        setProfiles((current) => ({
          ...current,
          [userId]: profile,
        }));
        setEditName(profile.username || "");
      }
    }

    loadOwnProfile();

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  // Mantém os nomes atualizados quando outro usuário muda o perfil.
  useEffect(() => {
    if (!session?.user?.id) return;

    const profileChannel = supabase
      .channel("profiles-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          const profile = payload.new;
          if (!profile?.id) return;

          setProfiles((current) => ({
            ...current,
            [profile.id]: {
              ...current[profile.id],
              ...profile,
            },
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [session?.user?.id]);

  // Mensagens em tempo real.
  useEffect(() => {
    if (!session?.user?.id) {
      setMessages([]);
      return;
    }

    let active = true;
    setMessages([]);
    setMessagesLoading(true);
    setMessageError("");

    const channelSubscription = supabase
      .channel(`messages-${channel}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel=eq.${channel}`,
        },
        (payload) => {
          if (!active) return;

          if (payload.eventType === "INSERT") {
            const newMessage = formatMessage(payload.new, session.user.id);
            setMessages((current) =>
              current.some((item) => item.id === newMessage.id)
                ? current
                : [...current, newMessage]
            );
          }

          if (payload.eventType === "DELETE") {
            setMessages((current) =>
              current.filter((item) => item.id !== payload.old.id)
            );
          }

          if (payload.eventType === "UPDATE") {
            const updated = formatMessage(payload.new, session.user.id);
            setMessages((current) =>
              current.map((item) =>
                item.id === updated.id ? updated : item
              )
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" && active) {
          setMessageError(
            "Não foi possível conectar às mensagens em tempo real."
          );
        }
      });

    async function loadMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("channel", channel)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (error) {
        setMessageError("Erro ao carregar mensagens: " + error.message);
      } else {
        setMessages(
          (data || []).map((row) =>
            formatMessage(row, session.user.id)
          )
        );
      }

      setMessagesLoading(false);
    }

    loadMessages();

    return () => {
      active = false;
      supabase.removeChannel(channelSubscription);
    };
  }, [session?.user?.id, channel]);

  // Busca os perfis dos autores das mensagens.
  useEffect(() => {
    if (!session?.user?.id || messages.length === 0) return;

    let active = true;
    const userIds = [...new Set(messages.map((msg) => msg.userId))];

    async function loadProfiles() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);

      if (!active || error) return;

      const profileMap = {};
      (data || []).forEach((profile) => {
        profileMap[profile.id] = profile;
      });

      setProfiles((current) => ({
        ...current,
        ...profileMap,
      }));
    }

    loadProfiles();

    return () => {
      active = false;
    };
  }, [session?.user?.id, messages]);

  useEffect(() => {
    if (room) updateParticipants(room);
  }, [profiles, room, updateParticipants]);

  // Salva a alteração do nome no Supabase.
  async function saveUsername() {
    const cleanName = editName.trim().slice(0, 24);

    if (cleanName.length < 2) {
      setSettingsMessage("O nome precisa ter pelo menos 2 caracteres.");
      return;
    }

    setSavingName(true);
    setSettingsMessage("");

    const userId = session.user.id;

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        { id: userId, username: cleanName },
        { onConflict: "id" }
      )
      .select("id, username, avatar_url")
      .single();

    if (error) {
      setSettingsMessage("Erro ao salvar: " + error.message);
    } else {
      setProfiles((current) => ({
        ...current,
        [userId]: data,
      }));

      await supabase.auth.updateUser({
        data: { username: cleanName },
      });

      setSettingsMessage("Nome atualizado!");
    }

    setSavingName(false);
  }

  // Entra em uma sala de voz.
  async function joinVoiceChannel(roomName) {
    if (!session || callBusy) return;

    if (room && voiceRoomName === roomName) {
      setShowCall(true);
      return;
    }

    setCallBusy(true);
    setVoiceError("");

    try {
      if (room) {
        await room.disconnect();
        setRoom(null);
      }

      setVoiceStatus("Conectando...");

      const { data, error } = await supabase.functions.invoke(
        "livekit-token",
        { body: { roomName } }
      );

      if (error) throw error;

      if (!data?.token || !data?.serverUrl) {
        throw new Error(
          data?.error || "Token ou URL do LiveKit não recebido."
        );
      }

      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h1080.resolution,
          frameRate: 30,
        },
        publishDefaults: {
          videoEncoding: {
            maxBitrate: 4_000_000,
            maxFramerate: 30,
          },
          screenShareEncoding: {
            maxBitrate: 8_000_000,
            maxFramerate: 30,
          },
          screenShareSimulcast: false,
        },
      });

      const refresh = () => updateParticipants(newRoom);

      newRoom.on(RoomEvent.Connected, () => {
        setVoiceStatus("Conectado");
        refresh();
      });

      newRoom.on(RoomEvent.Disconnected, () => {
        setVoiceStatus("Não conectado");
        setVoiceRoomName("");
        setParticipants([]);
        setRoom(null);
        setCamera(false);
        setSharing(false);
        setMic(true);
      });

      newRoom.on(RoomEvent.ParticipantConnected, refresh);
      newRoom.on(RoomEvent.ParticipantDisconnected, refresh);
      newRoom.on(RoomEvent.TrackPublished, refresh);
      newRoom.on(RoomEvent.TrackUnpublished, refresh);
      newRoom.on(RoomEvent.LocalTrackPublished, refresh);
      newRoom.on(RoomEvent.LocalTrackUnpublished, refresh);
      newRoom.on(RoomEvent.ActiveSpeakersChanged, refresh);
      newRoom.on(RoomEvent.TrackMuted, refresh);
      newRoom.on(RoomEvent.TrackUnmuted, refresh);

      newRoom.on(
        RoomEvent.TrackSubscribed,
        (track, publication, participant) => {
          if (track.kind === Track.Kind.Audio) {
            const audioElement = track.attach();

            audioElement.autoplay = true;
            audioElement.playsInline = true;
            audioElement.dataset.participant = participant.identity;

            if (
              selectedSpeaker &&
              typeof audioElement.setSinkId === "function"
            ) {
              audioElement.setSinkId(selectedSpeaker).catch(console.warn);
            }

            document.body.appendChild(audioElement);
          }

          refresh();
        }
      );

      newRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
        refresh();
      });

      await newRoom.connect(data.serverUrl, data.token);

      await newRoom.localParticipant.setMicrophoneEnabled(true, {
        ...(selectedMic ? { deviceId: selectedMic } : {}),
      });

      setRoom(newRoom);
      setVoiceRoomName(roomName);
      setMic(true);
      setVoiceStatus("Conectado");
      setShowCall(true);

      updateParticipants(newRoom);
      refreshDevices();
    } catch (error) {
      console.error("Erro na chamada:", error);
      setVoiceStatus("Erro na conexão");
      setVoiceError(error.message || "Não foi possível entrar na sala.");
    } finally {
      setCallBusy(false);
    }
  }

  async function leaveVoiceChannel() {
    if (!room) return;

    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setScreenShareEnabled(false);

      document
        .querySelectorAll("audio[data-participant]")
        .forEach((element) => element.remove());

      room.disconnect();
    } catch (error) {
      console.error("Erro ao sair da chamada:", error);
      room.disconnect();
    }

    setRoom(null);
    setVoiceRoomName("");
    setVoiceStatus("Não conectado");
    setMic(true);
    setCamera(false);
    setSharing(false);
    setParticipants([]);
    setVoiceError("");
  }

  async function toggleMic() {
    if (!room) {
      setVoiceError("Entre em uma sala de voz primeiro.");
      return;
    }

    try {
      const next = !mic;

      if (next) {
        await room.localParticipant.setMicrophoneEnabled(true, {
          ...(selectedMic ? { deviceId: selectedMic } : {}),
        });
      } else {
        await room.localParticipant.setMicrophoneEnabled(false);
      }

      setMic(next);
      updateParticipants(room);
    } catch (error) {
      setVoiceError("Erro no microfone: " + error.message);
    }
  }

  async function changeMicrophone(deviceId) {
    setSelectedMic(deviceId);

    if (!room || !mic) return;

    try {
      await room.localParticipant.setMicrophoneEnabled(true, {
        deviceId,
      });
    } catch (error) {
      setVoiceError("Não foi possível trocar o microfone: " + error.message);
    }
  }

  async function toggleCamera() {
    if (!room) {
      setVoiceError("Entre em uma sala de voz antes de ligar a câmera.");
      return;
    }

    try {
      const next = !camera;

      await room.localParticipant.setCameraEnabled(next, {
        ...(selectedCamera ? { deviceId: selectedCamera } : {}),
        resolution: VideoPresets.h720.resolution,
        frameRate: 30,
      });

      setCamera(next);
      updateParticipants(room);
      refreshDevices();
    } catch (error) {
      setVoiceError("Erro na câmera: " + error.message);
    }
  }

  async function changeCamera(deviceId) {
    setSelectedCamera(deviceId);

    if (!room || !camera) return;

    try {
      await room.localParticipant.setCameraEnabled(true, {
        deviceId,
        resolution: VideoPresets.h720.resolution,
        frameRate: 30,
      });
    } catch (error) {
      setVoiceError("Não foi possível trocar a câmera: " + error.message);
    }
  }

  // Abre o seletor nativo para escolher tela, janela ou aba.
  async function toggleScreenShare() {
    if (!room) {
      setVoiceError("Entre em uma sala de voz antes de compartilhar a tela.");
      return;
    }

    try {
      if (sharing) {
        await room.localParticipant.setScreenShareEnabled(false);
        setSharing(false);
        updateParticipants(room);
        return;
      }

      await room.localParticipant.setScreenShareEnabled(true, {
        audio: shareAudio,
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
      });

      setSharing(true);
      updateParticipants(room);
    } catch (error) {
      setVoiceError(
        "Não foi possível compartilhar. Escolha uma tela ou janela na janela do sistema. " +
          error.message
      );
    }
  }

  function toggleFullscreen(element) {
    if (!element) return;

    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      element.requestFullscreen?.().catch((error) => {
        setVoiceError("Não foi possível abrir em tela cheia: " + error.message);
      });
    }
  }

  // Cadastro e login.
  async function handleAuth(e) {
    e.preventDefault();

    setAuthError("");
    setAuthNotice("");

    const cleanUsername = usernameInput.trim().slice(0, 24);

    if (authMode === "signup" && cleanUsername.length < 2) {
      setAuthError("Seu nome precisa ter pelo menos 2 caracteres.");
      return;
    }

    setAuthBusy(true);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: cleanUsername },
          },
        });

        if (error) throw error;

        if (!data.session) {
          setAuthNotice(
            "Cadastro criado! Confirme seu e-mail e depois faça login."
          );
          setAuthMode("login");
        } else {
          setSession(data.session);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        setSession(data.session);
      }
    } catch (error) {
      setAuthError(error.message || "Não foi possível entrar.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (room) await leaveVoiceChannel();

    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthError(error.message);
      return;
    }

    setSession(null);
  }

  async function sendMessage(e) {
    e.preventDefault();

    const content = message.trim();
    if (!content || !session || messageBusy) return;

    setMessageBusy(true);
    setMessageError("");

    const { error } = await supabase.from("messages").insert({
      user_id: session.user.id,
      content,
      channel,
    });

    if (error) {
      setMessageError("Não foi possível enviar: " + error.message);
    } else {
      setMessage("");
    }

    setMessageBusy(false);
  }

  if (authLoading) {
    return <div className="loading-screen">Carregando NEXUS...</div>;
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <form className="auth-panel" onSubmit={handleAuth}>
          <div className="auth-logo">N</div>

          <h1>
            {authMode === "login" ? "Entrar no NEXUS" : "Criar sua conta"}
          </h1>

          <p>
            {authMode === "login"
              ? "Entre para continuar suas conversas."
              : "Escolha seu nome para aparecer para todos no NEXUS."}
          </p>

          {authMode === "signup" && (
            <>
              <label>Nome de usuário</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Como todos vão te chamar"
                autoComplete="nickname"
                minLength={2}
                maxLength={24}
                required
              />
            </>
          )}

          <label>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
            required
          />

          <label>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo de 6 caracteres"
            autoComplete={
              authMode === "login" ? "current-password" : "new-password"
            }
            minLength={6}
            required
          />

          {authError && <p className="auth-error">{authError}</p>}
          {authNotice && <p className="auth-notice">{authNotice}</p>}

          <button className="auth-submit" type="submit" disabled={authBusy}>
            {authBusy
              ? "Aguarde..."
              : authMode === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>

          <p className="auth-switch">
            {authMode === "login"
              ? "Ainda não tem conta? "
              : "Já tem uma conta? "}
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "login" ? "signup" : "login");
                setAuthError("");
                setAuthNotice("");
              }}
            >
              {authMode === "login" ? "Cadastre-se" : "Fazer login"}
            </button>
          </p>
        </form>
      </div>
    );
  }

  const screenParticipants = participants.filter((p) => p.isScreen);
  const normalParticipants = participants.filter((p) => !p.isScreen);
  const participantCount = normalParticipants.length;

  return (
    <div className="app">
      <aside className="server-bar">
        <div className="brand-mark">N</div>
        <div className="server-divider" />

        {initialServers.map((item) => (
          <button
            key={item.id}
            className={`server-icon ${server.id === item.id ? "selected" : ""}`}
            style={{ "--server-color": item.color }}
            title={item.name}
            onClick={() => {
              setServer(item);
              setChannel("geral");
            }}
          >
            {item.letter}
          </button>
        ))}

        <button className="server-add" title="Adicionar servidor">
          <Plus size={23} />
        </button>
        <button className="server-explore" title="Explorar servidores">
          <Compass size={21} />
        </button>

        <div className="server-spacer" />
        <button className="server-bottom">
          <Headphones size={21} />
        </button>
        <button className="server-bottom" onClick={() => setShowSettings(true)}>
          <Settings size={21} />
        </button>
      </aside>

      <aside className="channel-sidebar">
        <div className="workspace-header">
          <div>
            <span className="workspace-label">SEU ESPAÇO</span>
            <h2>{server.name}</h2>
          </div>
          <ChevronDown size={19} />
        </div>

        <div className="sidebar-search">
          <Search size={16} />
          <span>Buscar canais</span>
        </div>

        <div className="channel-section">
          <div className="section-heading">
            <span>CANAIS DE TEXTO</span>
            <Plus size={17} />
          </div>

          {["geral", "memes", "conversas", "clipes"].map((item) => (
            <button
              key={item}
              className={`channel-item ${channel === item ? "active" : ""}`}
              onClick={() => setChannel(item)}
            >
              <Hash size={18} />
              {item}
            </button>
          ))}
        </div>

        <div className="channel-section">
          <div className="section-heading">
            <span>CANAIS DE VOZ</span>
            <Plus size={17} />
          </div>

          {["Sala-de-voz", "Resenha"].map((item) => (
            <div className="voice-channel-wrap" key={item}>
              <button
                className={`channel-item ${
                  voiceRoomName === item ? "active" : ""
                }`}
                onClick={() => joinVoiceChannel(item)}
              >
                <Headphones size={18} />
                {item === "Sala-de-voz" ? "Sala de voz" : item}
                {voiceRoomName === item && (
                  <span className="channel-live-dot" />
                )}
              </button>

              {room && voiceRoomName === item && (
                <div className="channel-participants">
                  {normalParticipants.map((p) => (
                    <div className="channel-participant" key={p.id}>
                      <span className="mini-avatar">{getInitial(p.name)}</span>
                      <span>
                        {p.name}
                        {p.isLocal ? " (Você)" : ""}
                      </span>
                      {p.isMicrophoneEnabled ? (
                        <Mic size={12} />
                      ) : (
                        <MicOff size={12} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="user-avatar">
            {profiles[session.user.id]?.avatar_url ? (
              <img
                src={profiles[session.user.id].avatar_url}
                alt="Sua foto"
              />
            ) : (
              getInitial(username)
            )}
          </div>

          <div className="user-info">
            <strong>{username}</strong>
            <span>Online</span>
          </div>

          <button
            className="user-control"
            onClick={toggleMic}
            title="Microfone"
          >
            {mic ? <Mic size={18} /> : <MicOff size={18} />}
          </button>

          <button
            className="user-control"
            onClick={() => {
              setEditName(username);
              setSettingsMessage("");
              setShowSettings(true);
            }}
            title="Editar perfil e dispositivos"
          >
            <Settings size={18} />
          </button>

          <button
            className="user-control"
            onClick={handleSignOut}
            title="Sair da conta"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div className="chat-title">
            <Hash size={22} />
            <strong>{channel}</strong>
            <span className="header-divider" />
            <span className="channel-description">
              Um lugar para conversar e se divertir.
            </span>
          </div>

          <div className="header-actions">
            <button title="Notificações"><Bell size={19} /></button>
            <button title="Mensagens fixadas"><Pin size={19} /></button>
            <button
              title="Mostrar membros"
              className={showMembers ? "action-active" : ""}
              onClick={() => setShowMembers(!showMembers)}
            >
              <Users size={20} />
            </button>

            <div className="top-search">
              <Search size={16} />
              <input placeholder="Pesquisar..." />
            </div>

            <button className="mobile-menu"><Menu size={20} /></button>
          </div>
        </header>

        {room && showCall && (
          <section className="call-stage">
            <div className="call-stage-header">
              <div>
                <div className="call-live"><span /> VOZ CONECTADA</div>
                <h2><Headphones size={19} /> {voiceRoomName}</h2>
                <p>{participantCount} participante(s) na chamada</p>
              </div>

              <button
                className="call-minimize"
                onClick={() => setShowCall(false)}
                title="Minimizar chamada"
              >
                <X size={19} />
              </button>
            </div>

            <div
              className={`call-content ${
                screenParticipants.length ? "has-screen-share" : ""
              }`}
            >
              <div className="call-video-area">
                {screenParticipants.length > 0 && (
                  <div className="screen-share-area">
                    {screenParticipants.map((participant) => (
                      <ParticipantTile
                        key={participant.id}
                        participant={participant}
                        onFullscreen={toggleFullscreen}
                      />
                    ))}
                  </div>
                )}

                <div className="call-participant-grid">
                  {normalParticipants.map((participant) => (
                    <ParticipantTile
                      key={participant.id}
                      participant={participant}
                      onFullscreen={toggleFullscreen}
                    />
                  ))}
                </div>
              </div>

              <aside className="call-people-panel">
                <div className="call-people-title">
                  <Users size={15} />
                  <strong>Na chamada</strong>
                  <span>{participantCount}</span>
                </div>

                {normalParticipants.map((p) => (
                  <div className="call-person" key={p.id}>
                    <div className="mini-avatar">{getInitial(p.name)}</div>
                    <span>
                      {p.name}
                      {p.isLocal ? " (Você)" : ""}
                    </span>
                    {p.isMicrophoneEnabled ? (
                      <Mic size={13} />
                    ) : (
                      <MicOff size={13} />
                    )}
                  </div>
                ))}
              </aside>
            </div>

            <div className="call-toolbar">
              <div className="call-toolbar-info">
                <span className="toolbar-green-dot" />
                <span>Conectado à voz</span>
              </div>

              <div className="call-toolbar-controls">
                <button
                  className={!mic ? "toolbar-muted" : ""}
                  onClick={toggleMic}
                  title={mic ? "Desativar microfone" : "Ativar microfone"}
                >
                  {mic ? <Mic size={20} /> : <MicOff size={20} />}
                </button>

                <button
                  className={camera ? "toolbar-selected" : ""}
                  onClick={toggleCamera}
                  title="Câmera"
                >
                  {camera ? <Video size={20} /> : <VideoOff size={20} />}
                </button>

                <button
                  className={sharing ? "toolbar-selected" : ""}
                  onClick={toggleScreenShare}
                  title="Compartilhar tela"
                >
                  <MonitorUp size={20} />
                </button>

                <button
                  className="toolbar-disconnect"
                  onClick={leaveVoiceChannel}
                  title="Desconectar"
                >
                  <Phone size={20} />
                </button>
              </div>

              <div className="call-toolbar-count">
                <Users size={17} /> {participantCount}
              </div>
            </div>

            <label className="share-audio-option">
              <input
                type="checkbox"
                checked={shareAudio}
                onChange={(e) => setShareAudio(e.target.checked)}
                disabled={sharing}
              />
              <span>Compartilhar áudio junto com a tela</span>
              <small>
                A disponibilidade do áudio depende da tela ou aba escolhida.
              </small>
            </label>
          </section>
        )}

        {room && !showCall && (
          <button className="restore-call" onClick={() => setShowCall(true)}>
            <Headphones size={17} />
            Voltar para a chamada ({participantCount})
          </button>
        )}

        <div className="welcome-area">
          <div className="welcome-icon"><MessageCircle size={27} /></div>
          <h1>Bem-vindo ao <span>NEXUS</span>!</h1>
          <p>Este é o começo de uma nova conversa. Faça história por aqui.</p>
          <div className="welcome-line" />
        </div>

        <div className="messages">
          {messagesLoading && (
            <p className="empty-message">Carregando mensagens...</p>
          )}

          {!messagesLoading && messages.length === 0 && (
            <p className="empty-message">
              Ainda não há mensagens neste canal. Seja o primeiro a conversar!
            </p>
          )}

          {messages.map((msg) => (
            <article className="message" key={msg.id}>
              <div className="message-avatar">
                {profiles[msg.userId]?.avatar_url ? (
                  <img src={profiles[msg.userId].avatar_url} alt="Avatar" />
                ) : (
                  getInitial(
                    profiles[msg.userId]?.username ||
                    (msg.isMine ? username : "U")
                  )
                )}
              </div>

              <div className="message-content">
                <div className="message-meta">
                  <strong>
                    {profiles[msg.userId]?.username ||
                      (msg.isMine ? username : "Usuário")}
                  </strong>
                  <span>{msg.time}</span>
                </div>
                <p>{msg.text}</p>
              </div>
            </article>
          ))}
        </div>

        {messageError && <p className="message-error">{messageError}</p>}

        <form className="message-composer" onSubmit={sendMessage}>
          <button type="button" title="Anexar arquivo"><Plus size={22} /></button>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Conversar em #${channel}`}
            maxLength={2000}
          />
          <button type="button" title="Enviar imagem"><Image size={20} /></button>
          <button type="button" title="Emojis"><Smile size={20} /></button>
          <button
            type="submit"
            className="send-button"
            disabled={messageBusy || !message.trim()}
          >
            <Send size={19} />
          </button>
        </form>
      </main>

      {showMembers && (
        <aside className="members-sidebar">
          <div className="members-heading">
            <strong>{room ? "NA CHAMADA" : "MEMBROS"}</strong>
            <span>{room ? participantCount : "—"}</span>
          </div>

          {room ? (
            normalParticipants.map((p) => (
              <div className="member-item" key={p.id}>
                <div className="member-avatar">
                  {getInitial(p.name)}
                  <i className={`status-dot ${p.isSpeaking ? "speaking-dot" : ""}`} />
                </div>
                <span>{p.name}{p.isLocal ? " (Você)" : ""}</span>
                {p.isMicrophoneEnabled ? <Mic size={13} /> : <MicOff size={13} />}
              </div>
            ))
          ) : (
            <p className="members-empty">
              Entre em uma chamada para ver quem está conectado.
            </p>
          )}
        </aside>
      )}

      <footer className="voice-bar">
        <div className="voice-status">
          <span className={`voice-indicator ${room ? "voice-connected" : ""}`} />
          <div>
            <strong>{voiceStatus}</strong>
            <span>
              {voiceRoomName
                ? `Sala: ${voiceRoomName}`
                : "Entre em um canal de voz"}
            </span>
          </div>
        </div>

        <div className="voice-controls">
          <button
            className={!mic ? "control-off" : ""}
            onClick={toggleMic}
            title="Microfone"
          >
            {mic ? <Mic size={19} /> : <MicOff size={19} />}
          </button>
          <button
            className={camera ? "control-on" : ""}
            onClick={toggleCamera}
            title="Câmera"
          >
            {camera ? <Video size={19} /> : <VideoOff size={19} />}
          </button>
          <button
            className={sharing ? "control-on" : ""}
            onClick={toggleScreenShare}
            title="Compartilhar tela"
          >
            <MonitorUp size={19} />
          </button>
          {room ? (
            <button className="control-off" onClick={leaveVoiceChannel} title="Sair da chamada">
              <Phone size={19} />
            </button>
          ) : (
            <button
              onClick={() => joinVoiceChannel("Sala-de-voz")}
              title="Entrar na chamada"
              disabled={callBusy}
            >
              <Phone size={19} />
            </button>
          )}
        </div>

        {voiceError && (
          <div className="voice-error">
            <span>{voiceError}</span>
            <button onClick={() => setVoiceError("")}><X size={14} /></button>
          </div>
        )}
      </footer>

      {showSettings && (
        <div className="settings-overlay" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setShowSettings(false);
        }}>
          <section className="settings-panel">
            <div className="settings-header">
              <div>
                <span className="workspace-label">NEXUS</span>
                <h2>Configurações</h2>
              </div>
              <button onClick={() => setShowSettings(false)}><X size={20} /></button>
            </div>

            <div className="settings-section">
              <h3><Pencil size={16} /> Seu nome</h3>
              <label>Nome que aparece para as outras pessoas</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={24}
                minLength={2}
                placeholder="Seu nome"
              />
              <button className="settings-save" onClick={saveUsername} disabled={savingName}>
                <Save size={16} />
                {savingName ? "Salvando..." : "Salvar nome"}
              </button>
              {settingsMessage && <p className="settings-message">{settingsMessage}</p>}
            </div>

            <div className="settings-section">
              <h3><Mic size={16} /> Entrada de áudio</h3>
              <label>Microfone</label>
              <select
                value={selectedMic}
                onChange={(e) => changeMicrophone(e.target.value)}
              >
                {devices.microphones.length === 0 && (
                  <option value="">Nenhum microfone encontrado</option>
                )}
                {devices.microphones.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microfone ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-section">
              <h3><Volume2 size={16} /> Saída de áudio</h3>
              <label>Onde você escuta as outras pessoas</label>
              <select
                value={selectedSpeaker}
                onChange={(e) => setSelectedSpeaker(e.target.value)}
              >
                {devices.speakers.length === 0 && (
                  <option value="">Saída padrão do sistema</option>
                )}
                {devices.speakers.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Saída de áudio ${index + 1}`}
                  </option>
                ))}
              </select>
              <small>
                A troca de saída depende do suporte do navegador ou Electron.
              </small>
            </div>

            <div className="settings-section">
              <h3><Camera size={16} /> Câmera</h3>
              <label>Dispositivo de vídeo</label>
              <select
                value={selectedCamera}
                onChange={(e) => changeCamera(e.target.value)}
              >
                {devices.cameras.length === 0 && (
                  <option value="">Nenhuma câmera encontrada</option>
                )}
                {devices.cameras.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Câmera ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <button className="settings-done" onClick={() => setShowSettings(false)}>
              Concluir
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
