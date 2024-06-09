import { User } from './types';
import { FC } from 'react';

interface Props {
  users: Record<string, User>;
}

const Users: FC<Props> = ({ users }) => {
  return (
    <div className="relative">
      {Object.entries(users).map(([userId, userData], idx) => {
        return (
          <div key={userId} className="relative">
            <div
              key={userId}
              className={[
                'bg-scale-1200 absolute right-0 h-8 w-8 rounded-full bg-[length:50%_50%] bg-center transition-all',
                'flex items-center justify-center bg-no-repeat shadow-md',
              ].join(' ')}
              style={{
                border: `1px solid ${userData.hue}`,
                background: userData.color,
                transform: `translateX(${
                  Math.abs(idx - (Object.keys(users).length - 1)) * -20
                }px)`,
              }}
            >
              <div
                style={{ background: userData.color }}
                className="animate-ping-once h-7 w-7 rounded-full"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Users;
