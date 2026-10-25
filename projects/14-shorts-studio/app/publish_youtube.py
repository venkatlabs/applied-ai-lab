"""Upload finished episodes to YouTube as private, scheduled videos.

Needs: pip install google-api-python-client google-auth-oauthlib, and an OAuth
client file (YOUTUBE_CLIENT_SECRETS). Uploads are PRIVATE with publishAt set;
YouTube flips them public at that time. Each upload costs ~1,600 quota units of
a 10,000/day default, so about six per day. UNVERIFIED against a live account.

Note: videos uploaded through an API project that has not passed YouTube's
compliance audit are locked to private. If publishAt never fires, that is why.
"""
import os
from pathlib import Path

SCOPE = ["https://www.googleapis.com/auth/youtube.upload"]


class PublishError(RuntimeError):
    pass


def upload(folder, pack, publish_at):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError as error:
        raise PublishError("pip install google-api-python-client google-auth-oauthlib") from error

    client_id = os.getenv("YOUTUBE_CLIENT_ID")
    client_secret = os.getenv("YOUTUBE_CLIENT_SECRET")
    refresh = os.getenv("YOUTUBE_REFRESH_TOKEN")
    if client_id and client_secret and refresh:  # unattended path (GitHub Actions)
        creds = Credentials(None, refresh_token=refresh, token_uri="https://oauth2.googleapis.com/token",
                            client_id=client_id, client_secret=client_secret, scopes=SCOPE)
        creds.refresh(Request())
    else:
        secrets = os.getenv("YOUTUBE_CLIENT_SECRETS")
        if not secrets:
            raise PublishError("Set YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET/YOUTUBE_REFRESH_TOKEN "
                               "(or YOUTUBE_CLIENT_SECRETS for a local browser sign-in).")
        token_path = Path(os.getenv("YOUTUBE_TOKEN", ".youtube_token.json"))
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPE) if token_path.exists() else None
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                creds = InstalledAppFlow.from_client_secrets_file(secrets, SCOPE).run_local_server(port=0)
            token_path.write_text(creds.to_json())

    video = Path(folder) / "final.mp4"
    if not video.exists():
        video = Path(folder) / "raw.mp4"
    if not video.exists():
        raise PublishError(f"No final.mp4 or raw.mp4 in {folder}.")

    body = {
        "snippet": {
            "title": pack["title"],
            "description": pack["description"],
            "tags": pack["tags"],
            "categoryId": pack["categoryId"],
        },
        "status": {
            "privacyStatus": "private",
            "publishAt": publish_at,
            "selfDeclaredMadeForKids": pack["selfDeclaredMadeForKids"],
            "containsSyntheticMedia": pack["containsSyntheticMedia"],
        },
    }
    youtube = build("youtube", "v3", credentials=creds)
    request = youtube.videos().insert(
        part="snippet,status", body=body, media_body=MediaFileUpload(str(video), resumable=True)
    )
    response = None
    while response is None:
        _, response = request.next_chunk()
    return response["id"]
