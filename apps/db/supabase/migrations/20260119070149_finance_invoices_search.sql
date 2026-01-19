-- Add search RPC function for invoices that can search across customer names
-- This solves the PostgREST limitation where or() cannot mix local columns with foreign table columns

CREATE OR REPLACE FUNCTION search_finance_invoices(
  p_ws_id UUID,
  p_search_query TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_user_ids UUID[] DEFAULT NULL,
  p_wallet_ids UUID[] DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  ws_id UUID,
  customer_id UUID,
  notice TEXT,
  note TEXT,
  price BIGINT,
  total_diff BIGINT,
  created_at TIMESTAMPTZ,
  creator_id UUID,
  platform_creator_id UUID,
  transaction_id UUID,
  customer_full_name TEXT,
  customer_avatar_url TEXT,
  total_count BIGINT
) AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  -- Get total count for pagination
  SELECT COUNT(DISTINCT fi.id) INTO v_total_count
  FROM finance_invoices fi
  LEFT JOIN workspace_users wu ON fi.customer_id = wu.id
  LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
  WHERE fi.ws_id = p_ws_id
    AND (
      p_search_query IS NULL OR p_search_query = '' OR
      fi.notice ILIKE '%' || p_search_query || '%' OR
      fi.note ILIKE '%' || p_search_query || '%' OR
      wu.full_name ILIKE '%' || p_search_query || '%'
    )
    AND (p_start_date IS NULL OR fi.created_at >= p_start_date)
    AND (p_end_date IS NULL OR fi.created_at <= p_end_date)
    AND (p_user_ids IS NULL OR fi.creator_id = ANY(p_user_ids))
    AND (p_wallet_ids IS NULL OR wt.wallet_id = ANY(p_wallet_ids));

  -- Return paginated results with total count
  RETURN QUERY
  SELECT DISTINCT
    fi.id,
    fi.ws_id,
    fi.customer_id,
    fi.notice,
    fi.note,
    fi.price,
    fi.total_diff,
    fi.created_at,
    fi.creator_id,
    fi.platform_creator_id,
    fi.transaction_id,
    wu.full_name AS customer_full_name,
    wu.avatar_url AS customer_avatar_url,
    v_total_count AS total_count
  FROM finance_invoices fi
  LEFT JOIN workspace_users wu ON fi.customer_id = wu.id
  LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
  WHERE fi.ws_id = p_ws_id
    AND (
      p_search_query IS NULL OR p_search_query = '' OR
      fi.notice ILIKE '%' || p_search_query || '%' OR
      fi.note ILIKE '%' || p_search_query || '%' OR
      wu.full_name ILIKE '%' || p_search_query || '%'
    )
    AND (p_start_date IS NULL OR fi.created_at >= p_start_date)
    AND (p_end_date IS NULL OR fi.created_at <= p_end_date)
    AND (p_user_ids IS NULL OR fi.creator_id = ANY(p_user_ids))
    AND (p_wallet_ids IS NULL OR wt.wallet_id = ANY(p_wallet_ids))
  ORDER BY fi.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
