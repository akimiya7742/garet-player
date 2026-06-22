"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Search, Loader2, Play, Music } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useMusicWS } from "../contexts/MusicWSContext";
import { formatDuration } from "./QueueList";
import styles from "./SearchPanel.module.css";

export const SearchPanel: React.FC = () => {
	const { token } = useAuth();
	const { playTrack } = useMusicWS();
	
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "";

	const performSearch = useCallback(async (searchQuery: string) => {
		if (!searchQuery.trim() || !token) {
			setResults([]);
			return;
		}

		setLoading(true);
		setError(null);

		try {
			let url = `${backendUrl}/music/search?q=${encodeURIComponent(searchQuery)}`;
			if (typeof window !== "undefined") {
				const urlParams = new URLSearchParams(window.location.search);
				const isDiscordActivity = urlParams.has("frame_id") || window.location.ancestorOrigins?.contains("https://discord.com");
				if (isDiscordActivity)url = (`/api/music/search?q=${encodeURIComponent(searchQuery)}`);;
			}
			const res = await fetch(url, {
				headers: {
					Authorization: `Bearer ${token}`,
					"ngrok-skip-browser-warning": "69420",
				},
			});

			if (res.ok) {
				const data = await res.json();
				setResults(data.results || []);
			} else {
				const errData = await res.json().catch(() => ({}));
				setError(errData.error || "Failed to fetch search results");
			}
		} catch (err) {
			console.error("[Search] Fetch error:", err);
			setError("Network error occurred while searching.");
		} finally {
			setLoading(false);
		}
	}, [backendUrl, token]);

	// Debounce search input
	useEffect(() => {
		const delayDebounceFn = setTimeout(() => {
			if (query.trim().length >= 2) {
				performSearch(query);
			} else if (query.trim().length === 0) {
				setResults([]);
			}
		}, 500);

		return () => clearTimeout(delayDebounceFn);
	}, [query, performSearch]);

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		performSearch(query);
	};

	const handlePlayClick = (trackUrl: string) => {
		playTrack(trackUrl);
	};

	return (
		<div className={`glass-panel ${styles.searchContainer}`}>
			<form onSubmit={handleSearchSubmit} className={styles.searchBar}>
				<Search className={styles.searchIcon} />
				<input
					type="text"
					placeholder="Search songs, artists, links..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className={`glass-input ${styles.searchInput}`}
					aria-label="Search music queue input"
				/>
				{loading && <Loader2 className={styles.loadingSpinner} />}
			</form>

			<div className={styles.resultsArea}>
				{error && <div className={styles.errorMsg}>{error}</div>}

				{!loading && results.length === 0 && query.trim().length >= 2 && (
					<div className={styles.emptyState}>No songs found. Try another query!</div>
				)}

				{!loading && results.length === 0 && query.trim().length < 2 && (
					<div className={styles.emptyState}>
						<Music className={styles.introIcon} />
						<p className={styles.introText}>Discover new tracks instantly</p>
						<p className={styles.introSubtext}>Type keywords or paste URLs above to start playing.</p>
					</div>
				)}

				{results.length > 0 && (
					<div className={styles.resultsList}>
						{results.map((track, i) => (
							<div key={`${track.url}-${i}`} className={styles.resultItem}>
								{track.thumbnail ? (
									<img src={track.thumbnail} alt={track.title} className={styles.thumbnail} />
								) : (
									<div className={styles.thumbnailFallback}>
										<Music className={styles.fallbackIcon} />
									</div>
								)}
								
								<div className={styles.info}>
									<p className={styles.title} title={track.title}>{track.title}</p>
									<p className={styles.author}>{track.metadata.author || "Unknown Artist"}</p>
								</div>

								<span className={styles.duration}>{formatDuration(track.duration)}</span>

								<button
									type="button"
									onClick={() => handlePlayClick(track.url)}
									className={`glass-btn ${styles.playBtn}`}
									title="Play track"
									aria-label={`Play ${track.title} track`}
								>
									<Play className={styles.playIcon} />
								</button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};
export default SearchPanel;
