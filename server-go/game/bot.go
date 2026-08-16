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

func (bc *BotController) CreateBot(id, name, color string, presetIdx int, startX, startY float64) Creature {
	preset := DefaultPresets[presetIdx%len(DefaultPresets)]
	elements := make([]CreatureElement, len(preset.Elements))
	copy(elements, preset.Elements)

	forces := CalculatePhysicsForces(elements, 0)
	angle := DetermineCreatureHeadAngle(elements)

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
		Energy:         120,
		MaxEnergy:      180,
		FoodEaten:      0,
		Score:          100,
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

var BotNames = []string{
	"Жнец-Крушитель", "Молниеносный Кусач", "Вихревой Жвалоног", "Громозев-Многоножка",
	"Хаотичный Френзи-Бот", "Панцирный Скарабей", "Теневой Сталкер", "Клещевик-Дробитель",
}

var BotColors = []string{
	"#ef4444", "#f59e0b", "#8b5cf6", "#10b981", "#ec4899", "#06b6d4", "#6366f1", "#14b8a6",
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
		FoodEaten:      25,
		BankFood:       25,
		Score:          125,
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

func (bc *BotController) UpdateBot(bot *Creature, foods []Food, creatures []Creature) {
	// 1. Look for nearest food
	var closestFood *Food
	minFoodDistSq := math.Inf(1)

	for i := range foods {
		f := &foods[i]
		dx := f.X - bot.X
		if dx > 50.0 {
			dx -= 100.0
		} else if dx < -50.0 {
			dx += 100.0
		}
		dy := f.Y - bot.Y
		if dy > 50.0 {
			dy -= 100.0
		} else if dy < -50.0 {
			dy += 100.0
		}
		dSq := dx*dx + dy*dy
		if dSq < minFoodDistSq {
			minFoodDistSq = dSq
			closestFood = f
		}
	}

	// 2. Scan for other creatures: identify predators vs prey
	var threatCreature *Creature
	var preyCreature *Creature
	minThreatDistSq := math.Inf(1)
	minPreyDistSq := math.Inf(1)

	for i := range creatures {
		c := &creatures[i]
		if c.ID == bot.ID {
			continue
		}
		dx := c.X - bot.X
		if dx > 50.0 {
			dx -= 100.0
		} else if dx < -50.0 {
			dx += 100.0
		}
		dy := c.Y - bot.Y
		if dy > 50.0 {
			dy -= 100.0
		} else if dy < -50.0 {
			dy += 100.0
		}
		dSq := dx*dx + dy*dy

		// If other creature is larger or invulnerable -> threat!
		if (c.Score > bot.Score+15 || c.IsInvulnerable) && dSq < 64.0 {
			if dSq < minThreatDistSq {
				minThreatDistSq = dSq
				threatCreature = c
			}
		} else if c.Score <= bot.Score && dSq < 100.0 && !c.IsInvulnerable {
			// Smaller creature with jaw attack potential
			if dSq < minPreyDistSq {
				minPreyDistSq = dSq
				preyCreature = c
			}
		}
	}

	targetX := bot.X
	targetY := bot.Y
	shouldDash := false

	if threatCreature != nil {
		// Evade threat
		dx := bot.X - threatCreature.X
		dy := bot.Y - threatCreature.Y
		targetX = bot.X + dx*2.0
		targetY = bot.Y + dy*2.0
		bot.State = "moving"
		if bot.FoodEaten >= 10 && minThreatDistSq < 25.0 {
			shouldDash = true
		}
	} else if preyCreature != nil && minPreyDistSq < 64.0 {
		// Hunt prey creature to bite with jaw!
		targetX = preyCreature.X
		targetY = preyCreature.Y
		bot.State = "hunting"
		if bot.FoodEaten >= 5 && minPreyDistSq < 16.0 {
			shouldDash = true
		}
	} else if closestFood != nil && minFoodDistSq < 400.0 {
		// Hunt food
		targetX = closestFood.X
		targetY = closestFood.Y
		bot.State = "hunting"
		if bot.FoodEaten >= 15 && minFoodDistSq < 12.0 {
			shouldDash = true
		}
	} else {
		// Wander randomly
		if bc.rnd.Float64() < 0.08 {
			rad := bc.rnd.Float64() * math.Pi * 2
			targetX = bot.X + math.Cos(rad)*15.0
			targetY = bot.Y + math.Sin(rad)*15.0
		} else {
			targetX = bot.TargetX
			targetY = bot.TargetY
		}
	}

	bot.TargetX = targetX
	bot.TargetY = targetY
	bot.IsDashing = shouldDash

	// Calculate target angle
	dx := targetX - bot.X
	dy := targetY - bot.Y
	if math.Hypot(dx, dy) > 0.1 {
		rad := math.Atan2(dy, dx)
		targetAngle := (rad * 180.0) / math.Pi
		if targetAngle < 0 {
			targetAngle += 360
		}
		bot.TargetAngleDeg = targetAngle
	}

	// Muscle flex cycle with variety based on bot preset/style
	flexRate := 0.45
	if strings.Contains(bot.Name, "Молниеносный") || strings.Contains(bot.Name, "Френзи") {
		flexRate = 0.85
	} else if strings.Contains(bot.Name, "Жнец") || strings.Contains(bot.Name, "Скарабей") {
		flexRate = 0.30
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
