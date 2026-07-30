import type { Song } from '../../types'

export const NowPlaying = ({ song }: { song: Song | null }) => {
  return (
    <div className="p-[22px] border-1 border-[#9b7bff]/[0.25] rounded-[16px] bg-[linear-gradient(135deg,rgba(155,123,255,0.13),rgba(255,255,255,0.025))]">
      <span className="flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-[var(--purple-light)]">
        <i className="block size-1.5 rounded-full bg-[var(--purple-light)] shadow-[0_0_10px_var(--purple)]" />
        NOW PLAYING
      </span>
      {song ? (
        <div className="mt-[13px] flex items-center gap-4">
          <img
            className="aspect-video w-[142px] rounded-[10px] object-cover max-[680px]:w-[108px]"
            src={song.thumbnailUrl}
            alt=""
          />
          <div className="min-w-0">
            <h1 className="mb-[5px] overflow-hidden text-ellipsis whitespace-nowrap text-[22px] max-[680px]:text-[17px]">
              {song.title}
            </h1>
            <p className="m-0 text-[var(--muted)]">{song.artist}</p>
            <small className="text-[var(--dim)]">{song.addedBy}의 신청곡</small>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[112px] place-items-center rounded-[11px] border border-dashed border-[var(--line)] p-5 text-center text-[var(--dim)]">
          첫 곡을 추가해보세요.
        </div>
      )}
    </div>
  )
};
