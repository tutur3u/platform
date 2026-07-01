use super::*;

pub(super) fn changelog_route(path: &str) -> Option<ChangelogRoute<'_>> {
    if path == CHANGELOG_LIST_PATH {
        return Some(ChangelogRoute::List);
    }

    if let Some(slug) = path.strip_prefix(CHANGELOG_SLUG_PATH_PREFIX)
        && !slug.is_empty()
        && !slug.contains('/')
    {
        return Some(ChangelogRoute::Slug { slug });
    }

    let id = path.strip_prefix(CHANGELOG_DETAIL_PATH_PREFIX)?;

    if let Some(id) = id.strip_suffix("/publish")
        && valid_changelog_id_segment(id)
    {
        return Some(ChangelogRoute::Publish { id });
    }

    if !valid_changelog_id_segment(id) {
        return None;
    }

    Some(ChangelogRoute::Detail { id })
}

pub(super) fn valid_changelog_id_segment(id: &str) -> bool {
    !id.is_empty() && !id.contains('/') && id != "slug" && id != "upload"
}
