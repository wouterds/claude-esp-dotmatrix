#include <Arduino.h>
#include <FastLED.h>

namespace {

constexpr char VERSION[] = "1.0.0";

constexpr uint16_t LED_COUNT = 64;
constexpr uint16_t FRAME_BYTES = LED_COUNT * 3;

// 64 WS2812s at full white draw 3.8 A and a USB port offers a tenth of that.
// FastLED scales down any frame that would exceed this budget, so a host that
// sends white cannot brown out the board - which presents as a hang or a reboot
// loop rather than as anything to do with the frame that caused it.
constexpr uint8_t SUPPLY_VOLTS = 5;
constexpr uint32_t SUPPLY_MILLIAMPS = 450;

constexpr uint8_t DEFAULT_BRIGHTNESS = 32;

constexpr uint8_t MAGIC_0 = 0xC1;
constexpr uint8_t MAGIC_1 = 0xA0;

constexpr uint8_t CMD_FRAME = 0x01;
constexpr uint8_t CMD_BRIGHTNESS = 0x02;
constexpr uint8_t CMD_PING = 0x03;
constexpr uint8_t CMD_CLEAR = 0x04;

enum class Phase : uint8_t { Magic0, Magic1, Cmd, Len, Payload, Checksum };

CRGB leds[LED_COUNT];
uint8_t payload[FRAME_BYTES];

Phase phase = Phase::Magic0;
uint8_t command = 0;
uint8_t expected = 0;
uint8_t checksum = 0;
uint16_t received = 0;

void apply() {
  switch (command) {
    case CMD_FRAME:
      if (expected != FRAME_BYTES) {
        Serial.println("err len");
        return;
      }
      for (uint16_t i = 0; i < LED_COUNT; i++) {
        leds[i] = CRGB(payload[i * 3], payload[i * 3 + 1], payload[i * 3 + 2]);
      }
      FastLED.show();
      return;

    case CMD_BRIGHTNESS:
      if (expected != 1) {
        Serial.println("err len");
        return;
      }
      FastLED.setBrightness(payload[0]);
      FastLED.show();
      return;

    case CMD_CLEAR:
      FastLED.clear(true);
      return;

    case CMD_PING:
      Serial.printf("pong %s\n", VERSION);
      return;

    default:
      Serial.println("err cmd");
  }
}

void consume(uint8_t byte) {
  switch (phase) {
    case Phase::Magic0:
      if (byte == MAGIC_0) phase = Phase::Magic1;
      return;

    case Phase::Magic1:
      // A stray 0xC1 in a resync is itself a candidate for the first magic
      // byte, so hold here rather than dropping back to the start.
      phase = byte == MAGIC_1 ? Phase::Cmd : (byte == MAGIC_0 ? Phase::Magic1 : Phase::Magic0);
      return;

    case Phase::Cmd:
      command = byte;
      checksum = byte;
      phase = Phase::Len;
      return;

    case Phase::Len:
      expected = byte;
      checksum ^= byte;
      received = 0;
      phase = expected > 0 ? Phase::Payload : Phase::Checksum;
      return;

    case Phase::Payload:
      if (received < FRAME_BYTES) payload[received] = byte;
      checksum ^= byte;
      if (++received >= expected) phase = Phase::Checksum;
      return;

    case Phase::Checksum:
      if (byte == checksum) {
        apply();
      } else {
        Serial.println("err crc");
      }
      phase = Phase::Magic0;
      return;
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);

  FastLED.addLeds<WS2812B, MATRIX_PIN, GRB>(leds, LED_COUNT);
  FastLED.setMaxPowerInVoltsAndMilliamps(SUPPLY_VOLTS, SUPPLY_MILLIAMPS);
  FastLED.setBrightness(DEFAULT_BRIGHTNESS);
  FastLED.clear(true);

  Serial.printf("claude-status %s pin=%d leds=%d\n", VERSION, MATRIX_PIN, LED_COUNT);
}

void loop() {
  while (Serial.available() > 0) {
    consume(static_cast<uint8_t>(Serial.read()));
  }
}
