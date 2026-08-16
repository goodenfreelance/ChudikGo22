import React, { useState } from 'react';
import {
  Plus,
  Volume2,
  VolumeX,
  Sparkles,
  RefreshCw,
  HelpCircle,
  Grid,
  Edit3,
  Lock,
  Gamepad2,
  FileText,
  ChevronDown,
  ChevronUp,
  Sliders,
  Terminal,
  User,
  LogIn,
  LogOut,
  Database,
  Coins,
  ShieldCheck,
  Shield,
  Zap,
} from 'lucide-react';
import { GridTheme } from '../types';

interface ControlsProps {
  isRunning?: boolean;
  speed?: number;
  autoFood?: boolean;
  soundEnabled: boolean;
  gridTheme: GridTheme;
  showNodes: boolean;
  selectedCreatureId: string | null;
  selectedCreatureName?: string | null;
  isCreatureInBase?: boolean;
  username?: string | null;
  token?: string | null;
  food?: number;
  bankFood?: number;
  isBraking?: boolean;
  isInvulnerable?: boolean;
  invulnerableSec?: number;
  onActivateInvulnerability?: () => void;
  onToggleBrake?: () => void;
  onOpenAuth?: () => void;
  onOpenUserCreatures?: () => void;
  onLogout?: () => void;
  onToggleRunning?: () => void;
  onStep?: () => void;
  onChangeSpeed?: (speed: number) => void;
  onToggleAutoFood?: () => void;
  onToggleSound: () => void;
  onChangeTheme: (theme: GridTheme) => void;
  onToggleNodes: () => void;
  onAddFoodRandom?: () => void;
  onOpenEditor?: () => void;
  onEditSelectedCreature: () => void;
  onOpenAnatomy: () => void;
  onOpenLogs?: () => void;
  onOpenServerLogs?: () => void;
  serverErrorCount?: number;
  onReset: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  soundEnabled,
  gridTheme,
  showNodes,
  selectedCreatureId,
  selectedCreatureName,
  isCreatureInBase = false,
  username,
  token,
  food,
  bankFood = 0,
  isBraking = false,
  isInvulnerable = false,
  invulnerableSec = 0,
  onActivateInvulnerability,
  onToggleBrake,
  onOpenAuth,
  onOpenUserCreatures,
  onLogout,
  onToggleSound,
  onChangeTheme,
  onToggleNodes,
  onOpenEditor,
  onEditSelectedCreature,
  onOpenAnatomy,
  onOpenLogs,
  onOpenServerLogs,
  serverErrorCount = 0,
  onReset,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const canEdit = Boolean(selectedCreatureId && isCreatureInBase);

  if (isCollapsed) {
    return (
      <div className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900/95 backdrop-blur-md hover:bg-slate-800 text-slate-100 text-xs sm:text-sm font-bold rounded-2xl border border-indigo-500/50 shadow-2xl transition cursor-pointer active:scale-95"
          title="Развернуть панель управления"
        >
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>Панель управления</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 bg-slate-900/90 backdrop-blur-md p-1.5 sm:p-2 rounded-2xl sm:rounded-3xl border border-slate-700/80 shadow-2xl shadow-slate-950/60 max-w-[98vw] select-none">
      {/* 1. Main Action Group: Edit on Base & Logs */}
      <div className="flex items-center gap-1">
        {/* Edit Button (Available ONLY on Base) */}
        <button
          onClick={() => onEditSelectedCreature()}
          disabled={!canEdit}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 min-h-[38px] text-xs sm:text-sm font-bold rounded-xl border transition active:scale-95 ${
            canEdit
              ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400/80 shadow-lg shadow-amber-900/50 cursor-pointer ring-2 ring-amber-400/50 animate-pulse'
              : 'bg-slate-800/40 border-slate-700/30 text-slate-500 cursor-not-allowed opacity-60'
          }`}
          title={
            !selectedCreatureId
              ? 'Выберите чудика для редактирования'
              : !isCreatureInBase
              ? 'Редактирование доступно только на Базе (Safe Zone)! Зайдите на базу.'
              : `Редактировать выбранного чудика (${selectedCreatureName || 'Чудик'}) на Базе`
          }
        >
          {canEdit ? (
            <>
              <Edit3 className="w-4 h-4 text-amber-200" />
              <span>
                {selectedCreatureName
                  ? `Редактор: ${selectedCreatureName.length > 8 ? selectedCreatureName.slice(0, 8) + '...' : selectedCreatureName}`
                  : 'Редактор'}
              </span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 ml-0.5" />
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {!selectedCreatureId
                  ? 'Редактор'
                  : 'Редактор (на Базе)'}
              </span>
            </>
          )}
        </button>

        <button
          onClick={onOpenAnatomy}
          className="p-2 sm:p-2.5 min-h-[38px] text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-xl transition active:scale-95"
          title="Анатомия с рисунка"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {onOpenLogs && (
          <button
            onClick={onOpenLogs}
            className="p-2 sm:p-2.5 min-h-[38px] text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded-xl transition font-semibold text-xs flex items-center gap-1 active:scale-95"
            title="Открыть журнал логов созданных чудиков"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden xl:inline">Логи</span>
          </button>
        )}

        {onOpenServerLogs && (
          <button
            onClick={onOpenServerLogs}
            className="relative p-2 sm:p-2.5 min-h-[38px] text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 rounded-xl transition font-semibold text-xs flex items-center gap-1 border border-emerald-500/20 bg-emerald-500/10 active:scale-95"
            title="Диагностика сервера и логирование ошибок"
          >
            <Terminal className="w-4 h-4" />
            <span className="hidden xl:inline">Сервер</span>
            {serverErrorCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full animate-pulse shadow-md">
                {serverErrorCount > 99 ? '99+' : serverErrorCount}
              </span>
            )}
          </button>
        )}
      </div>

      <div className="h-5 w-px bg-slate-700/80 hidden sm:block" />

      {/* 2. Unified Food Counter (for Sprint, Upgrades & Invulnerability) */}
      <div
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 min-h-[38px] bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-xs sm:text-sm font-bold text-emerald-300 shadow-sm"
        title="Единый счетчик еды / золота: расходуется на ускорение (Space), щит неуязвимости (50 🪙 [V]) и апгрейд чудика на Базе"
      >
        <span className="text-base leading-none">🍎</span>
        <span>Золото: <strong className="text-emerald-200 font-mono text-sm sm:text-base">{food ?? bankFood}</strong></span>
      </div>

      {/* 3. Invulnerability Mode Button (10s duration, 50 gold cost, V key) */}
      {onActivateInvulnerability && (
        <button
          onClick={onActivateInvulnerability}
          disabled={isInvulnerable || (food ?? bankFood) < 50}
          className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 min-h-[38px] text-xs sm:text-sm font-black rounded-xl border transition cursor-pointer select-none active:scale-95 ${
            isInvulnerable
              ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 border-yellow-300 shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-300 animate-pulse'
              : (food ?? bankFood) >= 50
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-indigo-400/60 shadow-lg shadow-indigo-950/50 ring-1 ring-indigo-400/40'
              : 'bg-slate-800/40 border-slate-700/30 text-slate-500 cursor-not-allowed opacity-50'
          }`}
          title={
            isInvulnerable
              ? `Щит неуязвимости активен: осталось ${invulnerableSec > 0 ? invulnerableSec.toFixed(1) : '10.0'} сек. (Вы защищены от укусов, но не можете есть и кусать)`
              : (food ?? bankFood) >= 50
              ? 'Активировать режим неуязвимости на 10 сек [V] (Стоимость: 50 золота). Защищает от всех укусов!'
              : 'Недостаточно золота для щита (нужно 50 еды/золота)'
          }
        >
          {isInvulnerable ? (
            <>
              <Shield className="w-4 h-4 text-slate-950 fill-yellow-300 animate-bounce" />
              <span>ЩИТ: {invulnerableSec > 0 ? `${invulnerableSec.toFixed(1)}с` : '10с'}</span>
              <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            </>
          ) : (
            <>
              <Shield className="w-4 h-4 text-amber-300 fill-amber-400/20" />
              <span>ЗАЩИТА [V]</span>
              <span className="px-1.5 py-0.5 bg-amber-950/90 border border-amber-400/60 rounded-md text-[11px] font-mono font-bold text-amber-300">
                50 🪙
              </span>
            </>
          )}
        </button>
      )}

      {/* 4. Brake / Neutral Button (N key) */}
      {onToggleBrake && (
        <button
          onClick={onToggleBrake}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 min-h-[38px] text-xs sm:text-sm font-bold rounded-xl border transition cursor-pointer select-none active:scale-95 ${
            isBraking
              ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-950/50 ring-2 ring-rose-300 animate-pulse'
              : 'bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 border-slate-700/80'
          }`}
          title={
            isBraking
              ? 'Тормоз (Нейтраль) включен [N] — чудик замер на месте. Нажмите N или кнопку для продолжения движения'
              : 'Включить Тормоз (Нейтраль) [N] — чудик замрет на месте'
          }
        >
          <span>{isBraking ? '🛑' : '⏸️'}</span>
          <span>{isBraking ? 'Тормоз [N]' : 'Нейтраль [N]'}</span>
        </button>
      )}

      <div className="h-5 w-px bg-slate-700/80 hidden sm:block" />

      {/* 5. User Auth & Database Collection */}
      <div className="flex items-center gap-1">
        {token && username ? (
          <>
            <button
              onClick={onOpenUserCreatures}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 min-h-[38px] text-xs sm:text-sm font-semibold bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 rounded-xl transition shadow-sm active:scale-95"
              title="Моя база данных чудиков"
            >
              <Database className="w-3.5 h-3.5" />
              <span>База ({username})</span>
            </button>
            <button
              onClick={onLogout}
              className="p-2 sm:p-2.5 min-h-[38px] text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition active:scale-95"
              title="Выйти из аккаунта"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 min-h-[38px] text-xs sm:text-sm font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl transition active:scale-95"
            title="Войти или зарегистрироваться для сохранения чудиков в БД"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Вход в БД</span>
          </button>
        )}
      </div>

      <div className="h-5 w-px bg-slate-700/80 hidden md:block" />

      {/* 6. Theme & Display Modes Selector */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        <button
          onClick={() => {
            if (gridTheme === 'game-light') onChangeTheme('game');
            else if (gridTheme === 'game') onChangeTheme('cartoon2');
            else if (gridTheme === 'cartoon2') onChangeTheme('cartoon');
            else if (gridTheme === 'cartoon') onChangeTheme('notebook');
            else onChangeTheme('game-light');
          }}
          className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 min-h-[38px] rounded-xl text-xs sm:text-sm font-bold transition shadow-sm active:scale-95 ${
            gridTheme === 'game-light'
              ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-300 text-slate-950 font-black ring-2 ring-amber-300 shadow-amber-500/30'
              : gridTheme === 'game'
              ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white ring-2 ring-purple-500/50 shadow-purple-500/30'
              : gridTheme === 'cartoon2'
              ? 'bg-gradient-to-r from-yellow-300 via-pink-500 to-cyan-400 text-slate-950 font-black ring-2 ring-yellow-300 shadow-pink-500/40 animate-pulse'
              : gridTheme === 'cartoon'
              ? 'bg-gradient-to-r from-amber-400 via-rose-400 to-indigo-400 text-slate-900 font-bold ring-2 ring-amber-300 shadow-amber-500/30'
              : 'bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-slate-200'
          }`}
          title="Быстрое переключение темы оформления"
        >
          {gridTheme === 'game-light' ? (
            <>
              <Gamepad2 className="w-4 h-4 text-slate-950" />
              <span>Игра 2 ☀️</span>
            </>
          ) : gridTheme === 'game' ? (
            <>
              <Gamepad2 className="w-4 h-4 text-pink-300" />
              <span>Игра 1 🌙</span>
            </>
          ) : gridTheme === 'cartoon2' ? (
            <>
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>Мультик 2 🌈</span>
            </>
          ) : gridTheme === 'cartoon' ? (
            <>
              <Sparkles className="w-4 h-4 text-amber-950" />
              <span>Мультик 1 🎨</span>
            </>
          ) : (
            <>
              <Gamepad2 className="w-4 h-4 text-indigo-400" />
              <span>Тетрадь 📖</span>
            </>
          )}
        </button>

        <select
          value={gridTheme}
          onChange={(e) => onChangeTheme(e.target.value as GridTheme)}
          className="px-2 sm:px-2.5 py-1.5 sm:py-2 min-h-[38px] text-xs sm:text-sm bg-slate-800/90 border border-slate-700/80 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
        >
          <option value="game-light">Игра 2 🐍☀️ (Светлый игровой)</option>
          <option value="game">Игра 1 🐍🌙 (Темный игровой)</option>
          <option value="cartoon2">Мультик 2 🌈🎉 (Супер-яркий & Дисней)</option>
          <option value="cartoon">Мультик 1 🎨✨ (Милый классик)</option>
          <option value="notebook">Тетрадь 📖</option>
          <option value="blueprint">Чертеж 📐</option>
          <option value="dark">Темный 🌙</option>
        </select>

        <button
          onClick={onToggleNodes}
          className={`p-2 sm:p-2.5 min-h-[38px] rounded-xl transition active:scale-95 ${
            showNodes
              ? 'bg-indigo-900/50 border border-indigo-500/50 text-indigo-300'
              : 'text-slate-500 hover:bg-slate-800'
          }`}
          title="Показывать узлы сетки"
        >
          <Grid className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleSound}
          className={`p-2 sm:p-2.5 min-h-[38px] rounded-xl transition active:scale-95 ${
            soundEnabled
              ? 'text-indigo-300 hover:bg-slate-800'
              : 'text-slate-500 hover:bg-slate-800'
          }`}
          title="Звуковые эффекты"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        <button
          onClick={onReset}
          className="p-2 sm:p-2.5 min-h-[38px] text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition active:scale-95"
          title="Сбросить поле"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-700/80" />

        <button
          onClick={() => setIsCollapsed(true)}
          className="p-2 sm:p-2.5 min-h-[38px] text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition active:scale-95"
          title="Скрыть панель управления для обзора поля"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
