package game

import (
	"fmt"
	"math"
	"math/rand"
	"strings"
	"time"
)

type BotController struct {
	rnd *rand.Rand
}

func NewBotController() *BotController {
	return &BotController{
		rnd: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

var BotNames = []string{
	"Бот Зубастый Колобок",
	"Бот Шнырь-Торпеда",
	"Бот Хрум-Батон",
	"Бот Пельмень-Убийца",
	"Бот Бешеный Шпунтик",
	"Бот Двуглавый Горыныч",
	"Бот Вихревой Кусь",
	"Бот Тапок-Крушитель",
	"Бот Клещ-Прилипала",
	"Бот Ночной Кусака",
}

var BotColors = []string{
	"#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#ec4899",
	"#8b5cf6", "#6366f1", "#f97316", "#14b8a6", "#a855f7",
}

func (bc *BotController) CreateBot(id, name, color string, presetIdx int, startX, startY float64) Creature {
	preset := DefaultPresets[presetIdx%len(DefaultPresets)]
	elements := make([]CreatureElement, len(preset.Elements))
	copy(elements, preset.Elements)

	forces := CalculatePhysicsForces(elements, 0)
	angle := float64(bc.rnd.Intn(360))

	return Creature{
		ID:             id,
		PlayerID:       "bot-" + id,
		Name:           name,
		Color:          color,
		IsBot:          true,
		X:              startX,
		Y:              startY,
		AngleDeg:       angle,
		TargetAngleDeg: angle,
		TargetX:        startX,
		TargetY:        startY,
		Energy:         150,
		MaxEnergy:      200,
		FoodEaten:      30,
		BankFood:       30,
		Score:          150,
		StepsCount:     0,
		MuscleStep:     0,
		State:          "hunting",
		Elements:       elements,
		Forces:         forces,
		PrevX:          startX,
		PrevY:          startY,
		PrevAngleDeg:   angle,
		Kills:          0,
		LastActive:     time.Now(),
	}
}

func (bc *BotController) UpdateBot(bot *Creature, foods []Food, creatures []Creature, worldRadius float64) {
	if worldRadius <= 0 {
		worldRadius = 50.0
	}
	worldSize := worldRadius * 2.0

	// Helper for shortest toroidal delta
	getToroidalDelta := func(targetX, targetY, fromX, fromY float64) (float64, float64, float64) {
		dx := targetX - fromX
		if dx > worldRadius {
			dx -= worldSize
		} else if dx < -worldRadius {
			dx += worldSize
		}
		dy := targetY - fromY
		if dy > worldRadius {
			dy -= worldSize
		} else if dy < -worldRadius {
			dy += worldSize
		}
		dist := math.Hypot(dx, dy)
		return dx, dy, dist
	}

	bot.IsSleeping = false
	bot.IsBraking = false

	// 1. Priority 1: Auto-targeting & jaw alignment on nearest active human player within engagement radius (25 cells)
	var targetPlayer *Creature
	minPlayerDist := math.Inf(1)
	var playerDx, playerDy float64
	const autoTargetRadius = 25.0

	for i := range creatures {
		c := &creatures[i]
		if c.ID == bot.ID || c.IsBot || c.InBase || c.IsInvulnerable || IsInsideBase(c.X, c.Y, worldRadius) {
			continue
		}
		dx, dy, dist := getToroidalDelta(c.X, c.Y, bot.X, bot.Y)
		if dist <= autoTargetRadius && dist < minPlayerDist {
			minPlayerDist = dist
			targetPlayer = c
			playerDx = dx
			playerDy = dy
		}
	}

	// 2. Scan for human player threats vs human player prey (BOTS DO NOT TARGET EACH OTHER)
	var threatCreature *Creature
	minThreatDist := math.Inf(1)
	var threatDx, threatDy float64

	for i := range creatures {
		c := &creatures[i]
		if c.ID == bot.ID || c.IsBot {
			continue
		}
		dx, dy, dist := getToroidalDelta(c.X, c.Y, bot.X, bot.Y)
		if (c.Score > bot.Score+50 || c.IsInvulnerable) && dist < 8.0 {
			if dist < minThreatDist {
				minThreatDist = dist
				threatCreature = c
				threatDx = dx
				threatDy = dy
			}
		}
	}

	// 3. Scan for closest food
	var closestFood *Food
	minFoodDist := math.Inf(1)
	var foodDx, foodDy float64
	for i := range foods {
		f := &foods[i]
		dx, dy, dist := getToroidalDelta(f.X, f.Y, bot.X, bot.Y)
		if dist < minFoodDist {
			minFoodDist = dist
			closestFood = f
			foodDx = dx
			foodDy = dy
		}
	}

	targetAngleDeg := bot.TargetAngleDeg
	shouldDash := false

	if targetPlayer != nil {
		// Player within engagement radius: Orient jaw on player for direct bite contact!
		rad := math.Atan2(playerDy, playerDx)
		targetAngleDeg = (rad * 180.0) / math.Pi
		if targetAngleDeg < 0 {
			targetAngleDeg += 360.0
		}
		bot.TargetX = targetPlayer.X
		bot.TargetY = targetPlayer.Y
		bot.State = "hunting"

		// Lunge attack dash when closing in on player with jaws
		if bot.FoodEaten >= 2 && minPlayerDist < 7.5 {
			shouldDash = true
		}
	} else if threatCreature != nil && minThreatDist < 6.0 {
		// Flee away from dominant threat
		rad := math.Atan2(-threatDy, -threatDx)
		targetAngleDeg = (rad * 180.0) / math.Pi
		if targetAngleDeg < 0 {
			targetAngleDeg += 360.0
		}
		bot.TargetX = bot.X - threatDx*2.0
		bot.TargetY = bot.Y - threatDy*2.0
		bot.State = "moving"
		if bot.FoodEaten >= 5 && minThreatDist < 4.0 {
			shouldDash = true
		}
	} else if closestFood != nil && minFoodDist < 30.0 {
		// Hunt nearest food
		rad := math.Atan2(foodDy, foodDx)
		targetAngleDeg = (rad * 180.0) / math.Pi
		if targetAngleDeg < 0 {
			targetAngleDeg += 360.0
		}
		bot.TargetX = closestFood.X
		bot.TargetY = closestFood.Y
		bot.State = "hunting"
		if bot.FoodEaten >= 15 && minFoodDist < 3.0 {
			shouldDash = true
		}
	} else {
		// Natural wander navigation
		if bc.rnd.Float64() < 0.05 {
			wanderAngle := bc.rnd.Float64() * math.Pi * 2
			targetAngleDeg = (wanderAngle * 180.0) / math.Pi
			if targetAngleDeg < 0 {
				targetAngleDeg += 360.0
			}
			bot.TargetX = bot.X + math.Cos(wanderAngle)*12.0
			bot.TargetY = bot.Y + math.Sin(wanderAngle)*12.0
		}
	}

	bot.TargetAngleDeg = targetAngleDeg
	bot.IsDashing = shouldDash

	// Distinct muscle flex cadence across bot presets
	flexRate := 0.45
	if strings.Contains(bot.Name, "Торпеда") || strings.Contains(bot.Name, "Шпунтик") {
		flexRate = 0.85 // Fast bursts
	} else if strings.Contains(bot.Name, "Колобок") || strings.Contains(bot.Name, "Тапок") || strings.Contains(bot.Name, "Пельмень") {
		flexRate = 0.35 // Heavy steady pacing
	} else if strings.Contains(bot.Name, "Вихревой") {
		flexRate = 0.65 // Agile cadence
	} else if strings.Contains(bot.Name, "Горыныч") || strings.Contains(bot.Name, "Хрум") {
		flexRate = 0.50 // Sinusoidal swimming
	}

	if bc.rnd.Float64() < flexRate {
		bot.MuscleStep++
	}
}

func (bc *BotController) SpawnInitialBots(count int, worldRadius float64) []Creature {
	bots := make([]Creature, 0, count)
	for i := 0; i < count; i++ {
		id := fmt.Sprintf("bot-%d-%d", i+1, time.Now().UnixNano()%1000)
		name := BotNames[i%len(BotNames)]
		color := BotColors[i%len(BotColors)]
		presetIdx := i % len(DefaultPresets)

		angle := bc.rnd.Float64() * math.Pi * 2
		r := bc.rnd.Float64() * (worldRadius * 0.7)
		x := math.Cos(angle) * r
		y := math.Sin(angle) * r

		bots = append(bots, bc.CreateBot(id, name, color, presetIdx, x, y))
	}
	return bots
}
