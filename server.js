import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const CLIENT_ID = "tdtv5xvo30qthnf1kyul3j07t8v512";
const CLIENT_SECRET = "v0q7fiho2bwbahviuvrjgzl7n5f977";

let accessToken = "";
const userCache = {};

async function getAccessToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to acquire access token");
  accessToken = data.access_token;
  console.log("✅ Access token acquired");
}

async function getUserInfo(channel) {
  if (userCache[channel]) return userCache[channel];
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, {
    headers: { "Client-ID": CLIENT_ID, Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!data.data?.length) throw new Error(`No user info for ${channel}`);
  userCache[channel] = data.data[0];
  return data.data[0];
}

async function fetchTwitchData(channel, retry = true) {
  try {
    const headers = { "Client-ID": CLIENT_ID, Authorization: `Bearer ${accessToken}` };
    const user = await getUserInfo(channel);
    const userId = user.id;

    const [streamRes, followersRes, videosRes, clipsRes] = await Promise.all([
      fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, { headers }),
      fetch(`https://api.twitch.tv/helix/users/follows?to_id=${userId}`, { headers }),
      fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=8`, { headers }),
      fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${userId}&first=8`, { headers }),
    ]);

    if (retry && [streamRes, followersRes, videosRes, clipsRes].some(r => r.status === 401)) {
      await getAccessToken();
      return fetchTwitchData(channel, false);
    }

    const stream = await streamRes.json();
    const followers = await followersRes.json();
    const videos = await videosRes.json();
    const clips = await clipsRes.json();

    return {
      user,
      stream: stream.data?.[0] || null,
      followers: followers.total || 0,
      videos: videos.data || [],
      clips: clips.data || [],
    };
  } catch (err) {
    console.error(`Error fetching Twitch data for ${channel}:`, err);
    return { user: null, stream: null, followers: 0, videos: [], clips: [] };
  }
}

// API: specific channel
app.get("/api/twitch", async (req, res) => {
  const channel = req.query.channel;
  if (!channel) return res.status(400).json({ error: "Missing channel parameter" });
  try {
    if (!accessToken) await getAccessToken();
    const data = await fetchTwitchData(channel);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Twitch data" });
  }
});

// API: all channels
app.get("/api/channels", async (req, res) => {
  const channels = ["mintgirlmint","Pyrytspryt","dinodad90","RyuCrimson","PhoenixxRL","ngswisha","JubearTV","aulaniah","ffscait"];
  try {
    if (!accessToken) await getAccessToken();
    const data = await Promise.all(channels.map(ch => fetchTwitchData(ch)));
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch channels data" });
  }
});

// Optional root
app.get("/", (req, res) => {
  res.send("✅ Twitch API running. Use /api/twitch?channel=CHANNEL or /api/channels");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
