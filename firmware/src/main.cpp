#include <Adafruit_NeoPixel.h>
#include <Arduino.h>

namespace {

constexpr char VERSION[] = "1.0.0";

constexpr uint16_t LED_COUNT = 64;
constexpr uint16_t FRAME_BYTES = LED_COUNT * 3;

// A WS2812 channel draws about 20 mA wide open, so a full white panel wants
// 3.8 A and a USB port offers an eighth of that. The host is free to send white,
// so the budget is enforced here rather than trusted: over it, the whole frame
// is scaled down together, which dims the picture instead of browning the board
// out - and a brownout presents as a reboot with no hint that a frame caused it.
constexpr uint32_t BUDGET_MILLIAMPS = 450;
constexpr uint32_t MILLIAMPS_PER_CHANNEL_255 = 20;

constexpr uint8_t DEFAULT_BRIGHTNESS = 32;

constexpr uint8_t MAGIC_0 = 0xC1;
constexpr uint8_t MAGIC_1 = 0xA0;

constexpr uint8_t CMD_FRAME = 0x01;
constexpr uint8_t CMD_BRIGHTNESS = 0x02;
constexpr uint8_t CMD_PING = 0x03;
constexpr uint8_t CMD_CLEAR = 0x04;

enum class Phase : uint8_t { Magic0, Magic1, Cmd, Len, Payload, Checksum };

// RGB, not the GRB that most WS2812 strips want. Measured, not guessed: a frame
// of pure red came back green, which is what an RGB strip does with GRB bytes.
// Worth stating because it also disguises itself as a geometry fault - it swaps
// the colours of an orientation marker's arms, not their positions.
Adafruit_NeoPixel strip(LED_COUNT, MATRIX_PIN, NEO_RGB + NEO_KHZ800);

uint8_t payload[FRAME_BYTES];
uint8_t brightness = DEFAULT_BRIGHTNESS;

Phase phase = Phase::Magic0;
uint8_t command = 0;
uint8_t expected = 0;
uint8_t checksum = 0;
uint16_t received = 0;

// Returned as a 0-256 fixed point fraction so the caller can scale with a shift
// rather than floating point, which the frame path runs sixty times a second.
uint16_t powerScale() {
  uint32_t total = 0;
  for (uint16_t i = 0; i < FRAME_BYTES; i++) {
    total += payload[i];
  }

  const uint32_t scaled = (total * brightness) / 255;
  const uint32_t milliamps = (scaled * MILLIAMPS_PER_CHANNEL_255) / 255;
  if (milliamps <= BUDGET_MILLIAMPS) return 256;

  return (BUDGET_MILLIAMPS * 256) / milliamps;
}

void showFrame() {
  const uint16_t scale = powerScale();

  for (uint16_t i = 0; i < LED_COUNT; i++) {
    const uint8_t r = (payload[i * 3] * scale) >> 8;
    const uint8_t g = (payload[i * 3 + 1] * scale) >> 8;
    const uint8_t b = (payload[i * 3 + 2] * scale) >> 8;
    strip.setPixelColor(i, strip.Color(r, g, b));
  }

  strip.show();
}

void apply() {
  switch (command) {
    case CMD_FRAME:
      if (expected != FRAME_BYTES) {
        Serial.println("err len");
        return;
      }
      showFrame();
      return;

    case CMD_BRIGHTNESS:
      if (expected != 1) {
        Serial.println("err len");
        return;
      }
      brightness = payload[0];
      strip.setBrightness(brightness);
      strip.show();
      return;

    case CMD_CLEAR:
      strip.clear();
      strip.show();
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
      // A stray 0xC1 during a resync is itself a candidate for the first magic
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

  strip.begin();
  strip.setBrightness(brightness);
  strip.clear();
  strip.show();

  Serial.printf("claude-status %s pin=%d leds=%d\n", VERSION, MATRIX_PIN, LED_COUNT);
}

void loop() {
  while (Serial.available() > 0) {
    consume(static_cast<uint8_t>(Serial.read()));
  }
}
