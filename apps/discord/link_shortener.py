"""Link shortener functionality for the Discord bot."""

import os
from typing import Dict, Optional

from config import DEFAULT_WORKSPACE_ID, DISCORD_BOT_USER_ID, MAX_SLUG_ATTEMPTS
from supabase import Client, create_client
from utils import (
    extract_domain,
    generate_slug,
    get_base_url,
    is_valid_slug,
    is_valid_url,
)


class LinkShortener:
    """Handles link shortening operations."""

    def __init__(self):
        self.supabase: Optional[Client] = None
        self._initialize_supabase()

    def _initialize_supabase(self):
        """Initialize Supabase client."""
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not supabase_url or not supabase_key:
            raise ValueError("Supabase configuration missing")

        self.supabase = create_client(supabase_url, supabase_key)

    def shorten_link(
        self,
        url: str,
        custom_slug: Optional[str] = None,
        ws_id: str = DEFAULT_WORKSPACE_ID,
    ) -> Dict:
        """Shorten a URL using the Supabase database."""
        try:
            # Validate URL
            if not is_valid_url(url):
                return {"error": "Invalid URL format"}

            # Validate custom slug if provided
            if custom_slug and not is_valid_slug(custom_slug):
                return {
                    "error": "Custom slug can only contain letters, numbers, hyphens, and underscores (max 50 characters)"
                }

            # Determine slug to use
            slug = custom_slug if custom_slug else generate_slug()

            # Check if slug already exists and generate a new one if needed
            slug = self._get_available_slug(slug, custom_slug)
            if not slug:
                return {"error": "Failed to generate unique slug. Please try again."}

            # Extract domain from URL
            domain = extract_domain(url)

            # Insert the new shortened link
            new_link = self._insert_link(url, slug, ws_id, domain)
            if not new_link:
                return {"error": "Failed to create shortened link"}

            # Generate the shortened URL
            base_url = get_base_url()
            shortened_url = f"{base_url}/{slug}"

            return {
                "success": True,
                "original_url": url,
                "shortened_url": shortened_url,
                "slug": slug,
                "id": new_link["id"],
            }

        except Exception as e:
            print(f"Error shortening link: {e}")
            return {"error": "Internal server error"}

    def _get_available_slug(self, initial_slug: str, is_custom: bool) -> Optional[str]:
        """Get an available slug, retrying if necessary."""
        slug = initial_slug
        attempts = 0

        while attempts < MAX_SLUG_ATTEMPTS:
            # Check if slug exists
            result = (
                self.supabase.table("shortened_links")
                .select("id")
                .eq("slug", slug)
                .execute()
            )

            if not result.data:
                # Slug is available
                return slug

            if is_custom:
                # Custom slug is taken
                return None

            # Generate a new random slug
            slug = generate_slug()
            attempts += 1

        return None

    def _insert_link(
        self, url: str, slug: str, ws_id: str, domain: str
    ) -> Optional[Dict]:
        """Insert a new shortened link into the database."""
        insert_data = {
            "link": url,
            "slug": slug,
            "ws_id": ws_id,
            "domain": domain,
            "creator_id": DISCORD_BOT_USER_ID,
        }

        result = self.supabase.table("shortened_links").insert(insert_data).execute()

        return result.data[0] if result.data else None
