#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);


// =====================================================
// PCA9685 CHANNELS
// =====================================================

#define Q1  0   // Base
#define Q2  1   // Shoulder 1
#define Q3  2   // Shoulder 2
#define Q4  3   // Gripper


// =====================================================
// PWM SETTINGS
// =====================================================

#define SERVOMIN 150
#define SERVOMAX 600


// =====================================================
// ANGLE → PWM
// =====================================================

int angleToPulse(int angle)
{
  return map(angle, 0, 180, SERVOMIN, SERVOMAX);
}


// =====================================================
// SET SERVO
// =====================================================

void setServo(int channel, int angle)
{
  angle = constrain(angle, 0, 180);

  int pulse = angleToPulse(angle);

  pwm.setPWM(channel, 0, pulse);
}


// =====================================================
// MOVE ARM TO POSITION
// =====================================================

void moveToPosition(int q1, int q2, int q3, int q4)
{
  setServo(Q1, q1);
  setServo(Q2, q2);
  setServo(Q3, q3);
  setServo(Q4, q4);
}


// =====================================================
// START POSITION
// =====================================================
//
// START:
//
// Q1 = 0
// Q2 = 50
// Q3 = 0
// Q4 = 110
//
// CHANGE THESE VALUES HERE IF YOU WANT TO CHANGE
// THE STARTING POSITION.
// =====================================================

void startPosition()
{
  Serial.println();
  Serial.println("MOVING TO START POSITION");

  moveToPosition(0, 50, 0, 110);

  delay(2000);

  Serial.println("START POSITION REACHED");
}


// =====================================================
// CHECK POSITION
// =====================================================
//
// CHECK:
//
// Q1 = 0
// Q2 = 5
// Q3 = 12
// Q4 = 110
//
// This is the position where the arm searches for
// / checks the coloured box.
// =====================================================

void checkPosition()
{
  Serial.println();
  Serial.println("MOVING TO CHECK POSITION");

  moveToPosition(0, 5, 12, 110);

  delay(2000);

  Serial.println("CHECK POSITION REACHED");
}


// =====================================================
// GRIP BOX
// =====================================================
//
// GRIP:
//
// Q1 = 0
// Q2 = 5
// Q3 = 12
// Q4 = 90
//
// Q4 changes from 110 → 90 to close the gripper.
// =====================================================

void gripBox()
{
  Serial.println();
  Serial.println("GRIPPING BOX");

  moveToPosition(0, 5, 12, 90);

  delay(1500);

  Serial.println("BOX GRIPPED");
}


// =====================================================
// RED SORTING
// =====================================================
//
// RED HOLDING POSITION:
//
// Q1 = 30
// Q2 = 20
// Q3 = 10
// Q4 = 90
//
// RED RELEASE POSITION:
//
// Q1 = 30
// Q2 = 20
// Q3 = 10
// Q4 = 110
// =====================================================

void sortRed()
{
  Serial.println();
  Serial.println("MOVING TO RED LOCATION");

  // Carry box to RED location
  moveToPosition(30, 20, 10, 90);

  delay(2000);

  Serial.println("RED LOCATION REACHED");

  // Release box
  Serial.println("RELEASING RED BOX");

  moveToPosition(30, 20, 10, 110);

  delay(1500);

  Serial.println("RED BOX RELEASED");
}


// =====================================================
// GREEN SORTING
// =====================================================
//
// GREEN HOLDING POSITION:
//
// Q1 = 50
// Q2 = 20
// Q3 = 10
// Q4 = 90
//
// GREEN RELEASE POSITION:
//
// Q1 = 50
// Q2 = 20
// Q3 = 10
// Q4 = 110
// =====================================================

void sortGreen()
{
  Serial.println();
  Serial.println("MOVING TO GREEN LOCATION");

  // Carry box to GREEN location
  moveToPosition(50, 20, 10, 90);

  delay(2000);

  Serial.println("GREEN LOCATION REACHED");

  // Release box
  Serial.println("RELEASING GREEN BOX");

  moveToPosition(50, 20, 10, 110);

  delay(1500);

  Serial.println("GREEN BOX RELEASED");
}


// =====================================================
// RED SORTING SEQUENCE
// =====================================================
//
// CHECK
//   ↓
// GRIP
//   ↓
// RED
//   ↓
// RELEASE
//   ↓
// START
// =====================================================

void redSequence()
{
  Serial.println();
  Serial.println("==============================");
  Serial.println("RED SORTING SEQUENCE");
  Serial.println("==============================");

  checkPosition();

  gripBox();

  sortRed();

  startPosition();

  Serial.println();
  Serial.println("RED SORTING COMPLETE");
}


// =====================================================
// GREEN SORTING SEQUENCE
// =====================================================
//
// CHECK
//   ↓
// GRIP
//   ↓
// GREEN
//   ↓
// RELEASE
//   ↓
// START
// =====================================================

void greenSequence()
{
  Serial.println();
  Serial.println("==============================");
  Serial.println("GREEN SORTING SEQUENCE");
  Serial.println("==============================");

  checkPosition();

  gripBox();

  sortGreen();

  startPosition();

  Serial.println();
  Serial.println("GREEN SORTING COMPLETE");
}


// =====================================================
// SETUP
// =====================================================

void setup()
{
  Serial.begin(115200);

  // ESP32 I2C
  Wire.begin(21, 22);

  // PCA9685
  pwm.begin();
  pwm.setPWMFreq(50);

  delay(1000);


  // ===================================================
  // ALWAYS INITIALIZE AT START
  // ===================================================

  startPosition();


  // ===================================================
  // SERIAL CONTROL
  // ===================================================

  Serial.println();
  Serial.println("==============================");
  Serial.println("COLOR SORTING READY");
  Serial.println("==============================");

  Serial.println();

  Serial.println("Available commands:");

  Serial.println("start  -> 0,50,0,110");
  Serial.println("check  -> 0,5,12,110");
  Serial.println("red    -> Red sorting sequence");
  Serial.println("green  -> Green sorting sequence");

  Serial.println();

  Serial.println("Waiting for command...");
}


// =====================================================
// LOOP
// =====================================================

void loop()
{
  if (Serial.available())
  {
    String input = Serial.readStringUntil('\n');

    input.trim();

    input.toLowerCase();


    // =================================================
    // START COMMAND
    // =================================================

    if (input == "start")
    {
      startPosition();
    }


    // =================================================
    // CHECK COMMAND
    // =================================================

    else if (input == "check")
    {
      checkPosition();
    }


    // =================================================
    // RED COMMAND
    // =================================================

    else if (input == "red")
    {
      redSequence();
    }


    // =================================================
    // GREEN COMMAND
    // =================================================

    else if (input == "green")
    {
      greenSequence();
    }


    // =================================================
    // INVALID COMMAND
    // =================================================

    else
    {
      Serial.println();
      Serial.println("ERROR: Unknown command.");

      Serial.println();

      Serial.println("Available commands:");

      Serial.println("start");
      Serial.println("check");
      Serial.println("red");
      Serial.println("green");

      Serial.println();
    }


    Serial.println();
    Serial.println("Waiting for next command...");
    Serial.println();
  }
}