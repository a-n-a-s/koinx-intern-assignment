import app from './app.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';


dotenv.config();

const port = process.env.PORT || 3000;


const connectDB = async () => {
  try {
    // console.log(process.env.MONGO_URI)
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
connectDB();

app.listen(port, () => {
  console.log(`Server is running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
});

